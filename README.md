# LibreChat

**A Fork of the Original LibreChat Repository**

This repository is a fork of the [Original LibreChat](https://github.com/danny-avila/librechat) project. It is maintained by [Hubertus Becker](https://github.com/hubertusgbecker) and includes modifications specifically to address issues with Docker Compose and container execution on Debian Unix systems.

---

## Why This Fork?

The original LibreChat setup did not work correctly on Debian Unix due to Docker Compose and container execution issues. This fork makes the following key changes to better support a Unix environment:

- **Improved Docker Configuration:**  
  Adjustments to the `docker-compose.yml` file ensure that Docker containers run smoothly on Debian Unix.

- **Unix Filesystem Compliance:**  
  Absolute paths (e.g., `/usr/local/apps/librechat/data-node`) are used for volume bindings instead of relative paths, ensuring consistency and better data persistence.

- **Proper User Permissions:**  
  Environment variables (`UID` and `GID`) are used so that containers run with the correct Unix user permissions.

- **Updated Image References:**  
  Docker image references have been updated from `ghcr.io/danny-avila/...` to `ghcr.io/hubertusgbecker/...` to reflect the new storage location.

- **Production Mode Environment:**  
  The `NODE_ENV=production` variable is set in the API service for a proper production environment.

---

## Key Modifications

1. **Docker Compose File (`docker-compose.yml`):**
   - **Port Mapping:**  
     Uses the environment variable `${PORT}` for flexible port configuration.
   - **Environment Variables:**  
     `NODE_ENV=production` has been added to ensure the API runs in production mode.
   - **Container Naming:**  
     The API container is now named `LibreChat` (instead of `LibreChat-API`).
   - **Volume Bindings:**  
     - The `.env` file, images, and logs are now mounted into `/usr/local/apps/librechat/` paths.
     - The MongoDB data directory is bound from a relative path (`./data-node`) to an absolute path (`/usr/local/apps/librechat/data-node`) to meet Unix standards.
   - **Docker Image References:**  
     All image references have been updated to use `ghcr.io/hubertusgbecker/` instead of `ghcr.io/danny-avila/`.

2. **Focus on Docker Configuration:**  
   No changes have been made to other parts of the repository. This fork is solely about making LibreChat work correctly on Debian Unix.

---

## How to Use

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/hubertusgbecker/librechat.git