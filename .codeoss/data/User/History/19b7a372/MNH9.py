import os
from flask import Flask, render_template, request, jsonify, session
from werkzeug.utils import secure_filename
from vertex.prompt_optimizer import storage as storage_utils

app = Flask(__name__, template_folder='templates')
app.secret_key = 'printing_shop_secret'

# PALITAN ITO: Ang pangalan ng iyong Google Cloud Storage Bucket
BUCKET_NAME = "iyong-bucket-name"
# Pag-set ng Google Cloud Credentials
if os.path.exists("service-account.json"):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service-account.json"

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

@app.route('/upload/<session_id>', methods=['POST'])
def handle_upload(session_id):
    if 'file' not in request.files:
        return "No file part", 400

    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400

    filename = secure_filename(file.filename)
    local_path = os.path.join("/tmp", filename)
    bucket_name = os.environ.get("GCS_BUCKET_NAME", BUCKET_NAME)

    try:
        file.save(local_path)
        gcs_uri = f"gs://{bucket_name}/uploads/{filename}"
        storage_utils.upload_file_to_gcs(local_path, gcs_uri)

        active_uploads[session_id] = {"uploaded": True, "filename": filename}
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