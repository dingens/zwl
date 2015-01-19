#!/usr/bin/env python2
# -*- coding: utf8 -*-
import sys
from zwl import app

if len(sys.argv) > 1 and sys.argv[1] == 'subdir':

    # allows testing if everything still works when not running under /
    from werkzeug.serving import run_simple
    from werkzeug.wsgi import DispatcherMiddleware

    application = DispatcherMiddleware(None, {
        '/zwl': app
    })

    run_simple('localhost', 8232, application, use_debugger=True)

else:
    app.run(debug=True, port=8231)
