@echo off
REM Generate SSL certificates for development
echo 🔐 Generating SSL certificates for development...

REM Create ssl directory
if not exist "ssl" mkdir ssl

REM Generate private key
openssl genrsa -out ssl\key.pem 2048

REM Generate certificate signing request
openssl req -new -key ssl\key.pem -out ssl\cert.csr -subj "/C=US/ST=State/L=City/O=AudioDeck/CN=localhost"

REM Generate self-signed certificate
openssl x509 -req -days 365 -in ssl\cert.csr -signkey ssl\key.pem -out ssl\cert.pem

REM Remove CSR file
del ssl\cert.csr

echo ✅ SSL certificates generated successfully!
echo 📁 Certificates saved in ssl\ directory
echo.
echo Note: These are self-signed certificates for development only.
echo For production, use certificates from a trusted CA.
pause 