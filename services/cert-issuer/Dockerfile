FROM python:3.10-slim-bookworm

ARG CERT_ISSUER_VERSION=3.13.1
ARG CERT_ISSUER_COMMIT=199cd8be7c1d314651455a3b4d375961b8e5f6ce

LABEL org.opencontainers.image.title="DATN cert-issuer" \
      org.opencontainers.image.version="${CERT_ISSUER_VERSION}" \
      org.opencontainers.image.revision="${CERT_ISSUER_COMMIT}"

COPY requirements.lock /tmp/requirements.lock
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates build-essential \
    && python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.lock \
    && /opt/venv/bin/pip check \
    && apt-get purge -y --auto-remove git build-essential \
    && rm -rf /var/lib/apt/lists/* /root/.cache /tmp/requirements.lock

COPY apply_upstream_patch.py /tmp/apply_upstream_patch.py
RUN /opt/venv/bin/python /tmp/apply_upstream_patch.py && rm /tmp/apply_upstream_patch.py

COPY docker-entrypoint.sh /usr/local/bin/datn-cert-issuer-entrypoint
RUN chmod 0755 /usr/local/bin/datn-cert-issuer-entrypoint

ENV PATH="/opt/venv/bin:${PATH}"
WORKDIR /workspace
ENTRYPOINT ["datn-cert-issuer-entrypoint"]
CMD ["cert-issuer", "-c", "/workspace/config/conf.ini"]
