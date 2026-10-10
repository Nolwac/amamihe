#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $EUID -ne 0 ]]; then
  printf 'Run this helper with sudo so the PostgreSQL private key can be assigned to its container user.\n' >&2
  exit 1
fi

tls_directory="${VPS_TLS_DIR:-deploy/vps/.vps/tls}"
install -d -m 0755 "$tls_directory"
for name in ca.key ca.crt server.key server.crt; do
  if [[ -e "$tls_directory/$name" ]]; then
    printf 'TLS material already exists in %s; preserve and rotate it deliberately.\n' "$tls_directory" >&2
    exit 1
  fi
done

openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 3650 \
  -keyout "$tls_directory/ca.key" -out "$tls_directory/ca.crt" \
  -subj '/CN=Amamihe private PostgreSQL CA' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign'
openssl req -new -newkey rsa:3072 -sha256 -nodes \
  -keyout "$tls_directory/server.key" -out "$tls_directory/server.csr" \
  -subj '/CN=postgres'
cat > "$tls_directory/server.ext" <<'EXTENSIONS'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:postgres
EXTENSIONS
openssl x509 -req -sha256 -days 365 \
  -in "$tls_directory/server.csr" \
  -CA "$tls_directory/ca.crt" -CAkey "$tls_directory/ca.key" -CAcreateserial \
  -extfile "$tls_directory/server.ext" -out "$tls_directory/server.crt"
openssl verify -CAfile "$tls_directory/ca.crt" "$tls_directory/server.crt"

chmod 0644 "$tls_directory/ca.crt" "$tls_directory/server.crt"
chmod 0600 "$tls_directory/ca.key" "$tls_directory/server.key"
chown 999:999 "$tls_directory/server.key"
rm "$tls_directory/server.csr" "$tls_directory/server.ext"
printf 'PostgreSQL TLS files are ready in %s. Renew the server certificate before one year elapses.\n' "$tls_directory"
