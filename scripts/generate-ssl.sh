#!/bin/bash

# Generate SSL certificates for development
echo "🔐 Generating SSL certificates for development..."

# Create ssl directory
mkdir -p ssl

# Generate private key
openssl genrsa -out ssl/key.pem 2048

# Generate certificate signing request
openssl req -new -key ssl/key.pem -out ssl/cert.csr -subj "/C=US/ST=State/L=City/O=AudioDeck/CN=localhost"

# Generate self-signed certificate
openssl x509 -req -days 365 -in ssl/cert.csr -signkey ssl/key.pem -out ssl/cert.pem

# Remove CSR file
rm ssl/cert.csr

# Set proper permissions
chmod 600 ssl/key.pem
chmod 644 ssl/cert.pem

echo "✅ SSL certificates generated successfully!"
echo "📁 Certificates saved in ssl/ directory"
echo ""
echo "Note: These are self-signed certificates for development only."
echo "For production, use certificates from a trusted CA." 