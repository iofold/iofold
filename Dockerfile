# Cloudflare Sandbox - Python Eval Execution Environment
# Uses official Cloudflare Sandbox base image with built-in runtime
FROM docker.io/cloudflare/sandbox:0.6.1

# Install Python 3 for eval execution
# The base sandbox image is Ubuntu 22.04 minimal without Python
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && python3 --version

# Expose port for local development
EXPOSE 8080
