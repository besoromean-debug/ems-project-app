import os
from flask import Flask, render_template, request, jsonify, session
from werkzeug.utils import secure_filename
// 1. I-paste dito ang link na lumabas sa Cloudflare terminal mo
const cloudflareUrl = "https://desire-routers-clause-besides.trycloudflare.com";

// 2. Gumawa ng unique Session ID para sa transaction na ito
const sessionId = "sess_" + Math.random().toString(36).substr(2, 9);

// 3. Buuin ang kumpletong link para sa upload page
const fullUploadUrl = `${cloudflareUrl}/upload.html?session_id=`;

// 4. I-generate ang QR Code (Gamit ang qrcode.js library)
new QRCode(document.getElementById("qrcode"), {
    text: fullUploadUrl,
    width: 256,
    height: 256
});

console.log("QR Code generated for:", fullUploadUrl);

// 5. Simulan ang pag-check (polling) kung may file na na-upload para sa session na ito
const checkInterval = setInterval(() => {
    fetch(`/check-status/`)
        .then(response => response.json())
        .then(data => {
            if (data.uploaded) {
                clearInterval(checkInterval);
                alert("File received! Filename: " + data.filename);
                // Dito mo pwedeng i-redirect ang kiosk sa next step (e.g., review.html)
                window.location.href = `/review.html?session_id=`;
            }
        });
}, 3000); // Check every 3 seconds
from google.cloud import storage
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__, template_folder='templates')
app.secret_key = 'printing_shop_secret'

# Para makuha ang tamang 'https' scheme at host kapag nasa likod ng Cloudflare
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.config['PREFERRED_URL_SCHEME'] = 'https'

# Pag-set ng Google Cloud Credentials
if os.path.exists("service-account.json"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service-account.json"

def upload_file_to_gcs(local_path, gcs_uri):
    """Helper function para mag-upload sa GCS gamit ang official library."""
    if not gcs_uri.startswith("gs://"):
        raise ValueError("Invalid GCS URI. Dapat nagsisimula sa 'gs://'")
    
    # Kunin ang bucket name at destination path mula sa URI
    path_parts = gcs_uri[5:].split('/', 1)
    bucket_name = path_parts[0]
    destination_blob_name = path_parts[1]

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(destination_blob_name)
    blob.upload_from_filename(local_path)

# PALITAN ITO: Ang pangalan ng iyong Google Cloud Storage Bucket
# Kunin ang bucket name mula sa environment variable o palitan ang default
BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", "iyong-bucket-name")

# Global variable para sa simulation ng upload status
# Paalala: Sa totoong multi-user app, mas mainam gumamit ng Database o Redis.
upload_status = {"uploaded": False, "filename": ""}
# Gagamit tayo ng dictionary para suportahan ang maraming sessions.
active_uploads = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/home.html')
def home():
    return render_template('home.html')

@app.route('/print_process.html')
def print_process():
    return render_template('print_process.html')

@app.route('/process.html')
def process():
    return render_template('process.html')

@app.route('/review.html')
def review():
    return render_template('review.html')

@app.route('/upload.html')
def upload_page():
    return render_template('upload.html')

# Configuration para sa maximum file size (hal. 25 MB)
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024 # 25 Megabytes

@app.route('/upload/<session_id>', methods=['POST'])
def handle_upload(session_id):
    client_ip = request.headers.get('CF-Connecting-IP', request.remote_addr)
    print(f"[*] Receive upload request for session: {session_id} from IP: {client_ip}")
    if 'file' not in request.files:
        return "No file part", 400
    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400

    # Kuhanin ang print options mula sa form data
    copies = request.form.get('copies', type=int, default=1)
    color_mode = request.form.get('color_mode', default='bw')
    paper_size = request.form.get('paper_size', default='a4')
    print(f"[*] Options: {copies} copies, {color_mode}, {paper_size}")

    if copies < 1:
        return "Number of copies must be at least 1.", 400

    filename = secure_filename(file.filename)
    local_path = os.path.join("/tmp", filename)
    bucket_name = os.environ.get("GCS_BUCKET_NAME", BUCKET_NAME)

    # File size limit check
    # Note: Flask's MAX_CONTENT_LENGTH handles this at a lower level,
    # but a custom check can be added here if more specific error messages are needed.
    # For example, if file.content_length is available before saving.

    try:
        file.save(local_path)
        print(f"[*] File saved locally: {local_path}")

        # TODO: Implement File Format Converter (e.g., DOC/DOCX to PDF)
        # Kung ang file ay .doc o .docx, i-convert ito sa PDF dito
        # Example: if filename.endswith(('.doc', '.docx')):
        #              converted_pdf_path = convert_to_pdf(local_path)
        #              local_path = converted_pdf_path # Use the converted PDF for upload

        # TODO: Implement Automated Page Count
        # Basahin ang page count ng PDF (o converted PDF)
        page_count = 1 # Placeholder, dapat basahin mula sa file

        if bucket_name != "iyong-bucket-name":
            print(f"[*] Uploading to GCS bucket: {bucket_name}...")
            gcs_uri = f"gs://{bucket_name}/uploads/{filename}"
            upload_file_to_gcs(local_path, gcs_uri)
        else:
            print("[!] GCS Bucket not configured, skipping cloud upload for testing.")
            gcs_uri = f"local://{local_path}"

        # I-store ang lahat ng impormasyon sa active_uploads
        active_uploads[session_id] = {
            "uploaded": True,
            "filename": filename,
            "gcs_uri": gcs_uri,
            "copies": copies,
            "color_mode": color_mode,
            "paper_size": paper_size,
            "page_count": page_count, # Actual page count after conversion
            "status": "uploaded", # Initial status
            "price": 0.0 # Placeholder, to be computed
        }

        print(f"[+] Session {session_id} updated. Upload complete!")
        # TODO: Automated Price Computation
        # Batay sa page_count, copies, color_mode, at paper_size, i-compute ang presyo
        # active_uploads[session_id]["price"] = compute_price(page_count, copies, color_mode, paper_size)

        return "Success", 200
    except Exception as e:
        return f"Upload error: {str(e)}", 500
    finally:
        if os.path.exists(local_path):
            os.remove(local_path)

@app.route('/check-status/<session_id>')
def check_status(session_id):
    data = active_uploads.get(session_id, {"uploaded": False, "filename": ""})
    return jsonify(data)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)