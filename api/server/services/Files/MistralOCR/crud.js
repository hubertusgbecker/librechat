// ~/server/services/Files/MistralOCR/crud.js
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const {
  FileSources,
  envVarRegex,
  extractEnvVariable,
  extractVariableName,
} = require('librechat-data-provider');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { logger, createAxiosInstance } = require('~/config');
const { logAxiosError } = require('~/utils/axios');

const axios = createAxiosInstance();

/**
 * Uploads a document to Mistral API using file streaming to avoid loading the entire file into memory
 *
 * @param {Object} params Upload parameters
 * @param {string} params.filePath The path to the file on disk
 * @param {string} [params.fileName] Optional filename to use (defaults to the name from filePath)
 * @param {string} params.apiKey Mistral API key
 * @param {string} [params.baseURL=https://api.mistral.ai/v1] Mistral API base URL
 * @returns {Promise<Object>} The response from Mistral API
 */
async function uploadDocumentToMistral({
  filePath,
  fileName = '',
  apiKey,
  baseURL = 'https://api.mistral.ai/v1',
}) {
  const form = new FormData();
  form.append('purpose', 'ocr');
  const actualFileName = fileName || path.basename(filePath);
  const fileStream = fs.createReadStream(filePath);
  form.append('file', fileStream, { filename: actualFileName });

  return axios
    .post(`${baseURL}/files`, form, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
    .then((res) => res.data)
    .catch((error) => {
      logger.error('Error uploading document to Mistral:', error.message);
      throw error;
    });
}

async function getSignedUrl({
  apiKey,
  fileId,
  expiry = 24,
  baseURL = 'https://api.mistral.ai/v1',
}) {
  return axios
    .get(`${baseURL}/files/${fileId}/url?expiry=${expiry}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    .then((res) => res.data)
    .catch((error) => {
      logger.error('Error fetching signed URL:', error.message);
      throw error;
    });
}

/**
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} params.url - The document or image URL
 * @param {string} [params.documentType='document_url'] - 'document_url' or 'image_url'
 * @param {string} [params.model]
 * @param {string} [params.baseURL]
 * @returns {Promise<OCRResult>}
 */
async function performOCR({
  apiKey,
  url,
  documentType = 'document_url',
  model = 'mistral-ocr-latest',
  baseURL = 'https://api.mistral.ai/v1',
}) {
  const documentKey = documentType === 'image_url' ? 'image_url' : 'document_url';
  return axios
    .post(
      `${baseURL}/ocr`,
      {
        model,
        include_image_base64: false,
        document: {
          type: documentType,
          [documentKey]: url,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    )
    .then((res) => res.data)
    .catch((error) => {
      logger.error('Error performing OCR:', error.message);
      throw error;
    });
}

/**
 * Uploads a file to the Mistral OCR API and processes the OCR result.
 *
 * @param {Object} params - The params object.
 * @param {ServerRequest} params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user
 * @param {Express.Multer.File} params.file - The file object, which is part of the request. The file object should
 *                                     have a `mimetype` property that tells us the file type
 * @param {string} params.file_id - The file ID.
 * @param {string} [params.entity_id] - The entity ID, not used here but passed for consistency.
 * @returns {Promise<{ filepath: string, bytes: number }>} - The result object containing the processed `text` and `images` (not currently used),
 *                       along with the `filename` and `bytes` properties.
 */
const uploadMistralOCR = async ({ req, file, file_id, entity_id }) => {
  try {
    /** @type {TCustomConfig['ocr']} */
    const ocrConfig = req.app.locals?.ocr;

    const apiKeyConfig = ocrConfig.apiKey || '';
    const baseURLConfig = ocrConfig.baseURL || '';

    const isApiKeyEnvVar = envVarRegex.test(apiKeyConfig);
    const isBaseURLEnvVar = envVarRegex.test(baseURLConfig);

    const isApiKeyEmpty = !apiKeyConfig.trim();
    const isBaseURLEmpty = !baseURLConfig.trim();

    let apiKey, baseURL;

    if (isApiKeyEnvVar || isBaseURLEnvVar || isApiKeyEmpty || isBaseURLEmpty) {
      const apiKeyVarName = isApiKeyEnvVar ? extractVariableName(apiKeyConfig) : 'OCR_API_KEY';
      const baseURLVarName = isBaseURLEnvVar ? extractVariableName(baseURLConfig) : 'OCR_BASEURL';

      const authValues = await loadAuthValues({
        userId: req.user.id,
        authFields: [baseURLVarName, apiKeyVarName],
        optional: new Set([baseURLVarName]),
      });

      apiKey = authValues[apiKeyVarName];
      baseURL = authValues[baseURLVarName];
    } else {
      apiKey = apiKeyConfig;
      baseURL = baseURLConfig;
    }

    const mistralFile = await uploadDocumentToMistral({
      filePath: file.path,
      fileName: file.originalname,
      apiKey,
      baseURL,
    });

    const modelConfig = ocrConfig.mistralModel || '';
    const model = envVarRegex.test(modelConfig)
      ? extractEnvVariable(modelConfig)
      : modelConfig.trim() || 'mistral-ocr-latest';

    const signedUrlResponse = await getSignedUrl({
      apiKey,
      baseURL,
      fileId: mistralFile.id,
    });

    const mimetype = (file.mimetype || '').toLowerCase();
    const originalname = file.originalname || '';
    const isImage =
      mimetype.startsWith('image') || /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(originalname);
    const documentType = isImage ? 'image_url' : 'document_url';

    const ocrResult = await performOCR({
      apiKey,
      baseURL,
      model,
      url: signedUrlResponse.url,
      documentType,
    });

    let aggregatedText = '';
    const images = [];
    ocrResult.pages.forEach((page, index) => {
      if (ocrResult.pages.length > 1) {
        aggregatedText += `# PAGE ${index + 1}\n`;
      }

      aggregatedText += page.markdown + '\n\n';

      if (page.images && page.images.length > 0) {
        page.images.forEach((image) => {
          if (image.image_base64) {
            images.push(image.image_base64);
          }
        });
      }
    });

    return {
      filename: file.originalname,
      bytes: aggregatedText.length * 4,
      filepath: FileSources.mistral_ocr,
      text: aggregatedText,
      images,
    };
  } catch (error) {
    const message = 'Error uploading document to Mistral OCR API';
    throw new Error(logAxiosError({ error, message }));
  }
};

module.exports = {
  uploadDocumentToMistral,
  uploadMistralOCR,
  getSignedUrl,
  performOCR,
};
