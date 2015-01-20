# -*- coding: utf8 -*-
import os
import time
from flask import abort, send_from_directory, Response, json, request
from zwl import app

@app.route('/lines/<key>')
def lines(key=None):
    time.sleep(app.config['RESPONSE_DELAY'])

    if not key.endswith('.json'):
        abort(404)

    dir = os.path.join(app.root_path, 'lines')
    return send_from_directory(dir, key, mimetype='application/json; charset=utf8')

@app.route('/')
@app.route('/frontend/<filename>')
@app.route('/frontend/<subdir>/<filename>')
def frontend(subdir='', filename=None):
    if filename == 'zwl.html':
        # if accessed this way the js files wouldn't be found, so just forbid it
        abort(404)
    if filename is None:
        filename = 'zwl.html'

    # as an additional security measure, prevent arbitrary path traversal
    if subdir not in ('', 'src'):
        abort(403)

    # flask would use safe_join if we supplied a relative path
    frontend_dir = app.config.get('FRONTEND_DIR',
        os.path.join(app.root_path, os.pardir, os.pardir, 'frontend'))
    return send_from_directory(os.path.join(frontend_dir, subdir), filename)

@app.route('/_variables.js')
def js_variables():
    return Response('SCRIPT_ROOT = %s' % json.htmlsafe_dumps(request.script_root),
                    mimetype='text/javascript')

@app.route('/debug')
def debug():
    raise Exception
