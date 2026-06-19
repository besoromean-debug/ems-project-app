from flask import Flask, render_template, request, redirect, url_for, flash, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from flask_wtf.csrf import CSRFProtect

app = Flask(__name__)
app.config['SECRET_KEY'] = 'cyber-level-2-python-secret'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///ems.db'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=15)

db = SQLAlchemy(app)
csrf = CSRFProtect(app)
login_manager = LoginManager(app)

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    failed_attempts = db.Column(db.Integer, default=0)
    lockout_until = db.Column(db.DateTime, nullable=True)
    last_login = db.Column(db.DateTime, nullable=True)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()

        if not user:
            flash("Maling credentials.")
            return redirect(url_for('login'))

        if user.lockout_until and user.lockout_until > datetime.now():
            flash("Account locked.")
            return redirect(url_for('login'))

        if check_password_hash(user.password_hash, password):
            user.failed_attempts = 0
            user.lockout_until = None
            user.last_login = datetime.now()
            db.session.commit()
            session.permanent = True
            login_user(user)
            return redirect(url_for('dashboard'))
        else:
            user.failed_attempts += 1
            if user.failed_attempts >= 3:
                user.lockout_until = datetime.now() + timedelta(minutes=15)
                flash("Account locked. Walang attempts na natitira.")
            else:
                flash(f"Maling credentials. {3 - user.failed_attempts}/3 attempts left.")
            db.session.commit()
            
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    return "Welcome to Dashboard"

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        # Admin seeding example
        if not User.query.filter_by(username='admin').first():
            admin = User(
                username='admin', 
                password_hash=generate_password_hash('admin123')
            )
            db.session.add(admin)
            db.session.commit()
    app.run(port=5000)