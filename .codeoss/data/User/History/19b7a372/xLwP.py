import os
from flask import Flask, render_template, request, jsonify, session
from vertex.prompt_optimizer import storage as storage_utils

app = Flask(__name__, template_folder='templates')
app.secret_key = 'printing_shop_secret'

# PALITAN ITO: Ang pangalan ng iyong Google Cloud Storage Bucket
BUCKET_NAME = "iyong-bucket-name"

# Global variable para sa simulation ng upload status
upload_status = {"uploaded": False, "filename": ""}

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

@app.route('/upload', methods=['POST'])
def handle_upload():
    if 'file' not in request.files:
        return "No file part", 400
    
    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400

    # 1. I-save muna sa local temporary folder
    local_path = os.path.join("/tmp", file.filename)
    file.save(local_path)

    # 2. I-upload sa Google Cloud Storage gamit ang iyong utility
    gcs_uri = f"gs://{BUCKET_NAME}/uploads/{file.filename}"
    storage_utils.upload_file_to_gcs(local_path, gcs_uri)

    # 3. I-update ang status para sa polling
    upload_status["uploaded"] = True
    upload_status["filename"] = file.filename

    return "Upload Success", 200

@app.route('/check-status')
def check_status():
    return jsonify(upload_status)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)