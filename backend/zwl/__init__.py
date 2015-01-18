from flask import Flask

app = Flask(__name__)

app.config.from_object('settings')
app.config.from_envvar('ZWL_SETTINGS', silent=True)

# circular imports
import zwl.views
