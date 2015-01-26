# -*- coding: utf8 -*-
from flask import Flask
from flask.ext.sqlalchemy import SQLAlchemy
from zwl import default_settings

app = Flask(__name__)

app.config.from_object(default_settings)
app.config.from_envvar('ZWL_SETTINGS', silent=True)
db = SQLAlchemy(app)


# circular imports
import zwl.database
import zwl.views
import zwl.lines
