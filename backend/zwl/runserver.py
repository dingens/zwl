#!/usr/bin/env python2
# -*- coding: utf8 -*-
import os
import sys
from flask import Response
from zwl import app

extra_files = []
try:
    extra_files.append(os.path.join(app.root_path, os.environ['ZWL_SETTINGS']))
except KeyError:
    pass

if len(sys.argv) > 1 and sys.argv[1] == 'subdir':

    notfound = Response('Use <a href="/zwl/">/zwl/</a>, please!', status=404)

    # allows testing if everything still works when not running under /
    from werkzeug.serving import run_simple
    from werkzeug.wsgi import DispatcherMiddleware

    application = DispatcherMiddleware(notfound, {
        '/zwl': app,
    })

    run_simple('localhost', 8232, application, use_debugger=True,
               use_reloader=True, extra_files=extra_files, threaded=True)

else:
    app.run(debug=True, port=8231, extra_files=extra_files, threaded=True)
