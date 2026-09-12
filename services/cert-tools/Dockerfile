FROM python:3.11-slim-bookworm

ARG CERT_TOOLS_VERSION=3.0.2
ARG CERT_TOOLS_COMMIT=ac6a4ffd5b0d3bcec2de40e370a12152ba880ac0

LABEL org.opencontainers.image.title="DATN cert-tools" \
      org.opencontainers.image.version="${CERT_TOOLS_VERSION}" \
      org.opencontainers.image.revision="${CERT_TOOLS_COMMIT}"

COPY requirements.lock /tmp/requirements.lock
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.lock \
    && /opt/venv/bin/pip check \
    && rm /tmp/requirements.lock

ENV PATH="/opt/venv/bin:${PATH}"
WORKDIR /workspace
CMD ["create-certificate-template", "--help"]
