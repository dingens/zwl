var ZWL = {};

/*
Code layout remarks
===================

vocabulary notes.
* graph: a diagram
* line: a concatenation of stations and rail lines, and information about
  these elements. Corresponds roughly to German "Strecke"
* path: the image drawn inside a graph for one train. Must not be confused with
  `line`, see above.

class hierarchy.
* ZWL.Display is the main class. It contains all other elements, manages the
  overall layout and keeps the time.
* ZWL.TimeAxis draws a draggable time axis. By dragging it the time frame
  displayed in the graphs can be changed.
* ZWL.Graph is one graph of one line or line segment, containing the names of
  stations on the x axis and the train paths inside the graph. The portion of
  the line that is displayed can be varied. It does not modify time, only read
  the value set in Display by TimeAxis.
* ZWL.TrainDrawing is the class that maintains and draws one train path,
  updating it if the timetable changes etc.
* ZWL.ViewConfig is an object that stores information on which graphs shall be
  displayed. It is normally configured by the user using location.hash. It
  is responsible for neatly positioning graph(s) and timeaxis on the screen.

*/


ZWL.Display = function (element, viewconfig) {
    this.svgelem = SVG(element)
    // put lines in the middle of pixels, so that one white pixel is drawn, not
    // two gray ones. Chrome doesn't accept the translate on <svg>, only on <g>
    this.svg = this.svgelem.group().translate(0.5, 0.5);

    this.timezoom = .25; // can be overridden by viewconfig. pixels per second
    this.epoch = 13042800; // the time that corresponds to y=0
    this.now = 13095034;
    this.starttime = this.now - 600;
    this.endtime = null;

    this.timeaxis = new ZWL.TimeAxis(this);
    try {
        this.viewconfig = this._parse_viewconfig(viewconfig);

        // this will set this.graphs, and maybe overwrite this.timezoom
        this.viewconfig.apply(this);

        var graphNames = this.graphs.map(function(g) {
            return ALL_LINES[g.linename];
        });
        document.title = graphNames.join(' / ') + ' - ZWL - EBuEF';

    } catch (e) {
        if ( ! ( e instanceof ZWL.ViewConfigParseError))
            throw e;
        $('svg').remove();
        var div = $('<div id="errormsg">Fehler beim Parsen der Ansichtskonfiguration: </div>');
        div.append($('<pre/>').text(e.msg));
        $(document.body).prepend(div);
        return;
    }

    // initially position everything
    this.sizechange();

    // avoid resizing tons of times while the user drags the window
    $(window).resize(function () {
        window.clearTimeout(this.resizetimeout);
        this.resizetimeout =
            window.setTimeout(this.sizechange.bind(this), 250);
    }.bind(this));
};

ZWL.Display.prototype = {
    sizechange: function (width,height) {
        if ( width == undefined && height == undefined) {
            width = $(window).width() - 25;
            height = $(window).height() - 25;
        }
        this.width = width;
        this.height = height;
        this.svgelem.size(width,height);
        this.endtime = this.starttime + (this.height - this.measures.graphtopmargin
                       - this.measures.graphbottommargin) / this.timezoom;

        this.viewconfig.sizechange(this, width, height);
    },
    timechange: function (starttime) {
        // this runs lots of times while the user moves the time axis, so keep it short!

        this.starttime = starttime;

        this.timeaxis.timechange();
        this.graphs.map(function(g) {
            g.timechange();
        });
        this.endtime = this.starttime + (this.height - this.measures.graphtopmargin
                       - this.measures.graphbottommargin) / this.timezoom;
    },
    redraw: function () {
        this.graphs.map(function(g) {
            g.redraw();
        });
        this.timeaxis.redraw();
    },
    focustrain: function (trainnr) {
        // quickfix for firefox, see issue #24
        this.unfocustrains();

        this.graphs.map(function(g) {
            g.focustrain(trainnr);
        });
    },
    unfocustrains: function () {
        this.graphs.map(function(g) {
            g.unfocustrains();
        });
    },
    time2y: function (time) {
        return this.timezoom * (time - this.epoch);
    },
    y2time: function (y) {
        return y / this.timezoom + this.epoch;
    },
    _parse_viewconfig: function(vc) {
        if ( vc.indexOf('/') == -1 ) {
            if ( vc == '' )
                vc = DEFAULT_LINE;
            var args = [vc];
            var method = 'gt';
        } else {
            var args = vc.split('/');
            var method = args.shift();
        }
        return new ZWL.ViewConfig(method, args);
    },
    measures: {
        graphtopmargin: 45,
        graphbottommargin: 50,
        graphhorizmargin: 70,
        graphminwidth: 200,
        timeaxiswidth: 75,
        horizdistance: -10,
    },
};


ZWL.Graph = function (display, linename, viewcfg) {
    // allow passing unparsed stuff as viewcfg
    if ( viewcfg.constructor === Array ) {
        try {
            viewcfg = this._parse_viewcfg(viewcfg);
        } catch(e) {
            if ( ! ( e instanceof ZWL.ViewConfigParseError))
                throw e;
            console.log("Error parsing graph's view config, ignoring.", e.msg);
            viewcfg = {};
        }
    }
    if ( viewcfg == null )
        viewcfg = {};

    this.display = display;
    this.linename = linename;
    this.xstart = defaultval(viewcfg.xstart, 0);
    this.xend = defaultval(viewcfg.xend, 1);
    this.trains = {};
    this.svg = this.display.svg.group().addClass('graph').addClass('graph_' + linename);

    this.trainboxframe = this.svg.rect(0,0).addClass('trainboxframe');
    this.locmarkers = this.svg.group().addClass('locmarkers');
    this.traincliprect = this.svg.rect(0,0);
    this.trainclip = this.svg.clip().add(this.traincliprect);
    this.trainbox = this.svg.group().addClass('trainbox');
    this.trainpaths = this.trainbox.group().addClass('trainpaths');
    this.trainlabels = this.trainbox.group().addClass('trainlabels');

    // quickfix for firefox, see issue #24
    this.trainboxframe.on('mouseenter', function() {
        this.display.unfocustrains();
    }.bind(this));

    this.nowmarker = this.trainbox.line(-1,-1,-1,-1).addClass('nowmarker')
        .clipWith(this.trainclip);

    this.pastblur = {};
    this.pastblur.group = this.trainbox.group().addClass('pastblur');
    this.pastblur.past = this.pastblur.group.rect(0,0).addClass('pastblur-past');
    this.pastblur.future = this.pastblur.group.rect(0,0)
        .addClass('pastblur-future');
    this.pastblur.mask = this.svg.mask().add(this.pastblur.group);

    this.locaxis = {};
    this.locaxis.g = this.svg.group().addClass('locaxis');
    this.locaxis.labels = this.locaxis.g.group();
    this.locaxis.bottom = this.svg.use(this.locaxis.labels).addClass('locaxis');

    if (this.linegetterthrobber != undefined)
        this.linegetterthrobber.remove();
    this.linegetterthrobber = this.svg.plain('Lade Streckendaten …');
    this.graphdatafetcherthrobber = this.svg.plain('Lade Züge …').hide();
    this.linegetter = $.getJSON(SCRIPT_ROOT + '/lines/' + this.linename + '.json',
        (function (data) {
            this.line = new ZWL.LineConfiguration(data);
            this.linegetterthrobber.remove();

            for ( var i in this.line.elements ) {
                var loc = this.line.elements[i];
                if ( loc.display_label ) {
                    this.locaxis[loc.id] = this.locaxis.labels.plain(loc.code)
                        .attr('title', loc.name);
                    this.locmarkers[loc.id] = this.locmarkers.line(0,0,0,0).hide();
                }
            }
        }).bind(this)
    );

};
ZWL.Graph.from_string = function (display, vc) {
    var cfg = vc.split(',');
    var linename = cfg.shift();
    if ( linename == '' )
        throw new ZWL.ViewConfigParseError('keine Strecke angegeben');
    if ( ! ALL_LINES.hasOwnProperty(linename) )
        throw new ZWL.ViewConfigParseError('ungültiger Streckenname: ' + linename);
    return new ZWL.Graph(display, linename, cfg);
};

ZWL.Graph.prototype = {
    sizechange: function (x,y, width,height) {
        if (arguments.length < 4) console.error('not enough arguments');

        // position and dimensions of the graph box
        // round everything avoid getting 2px gray lines (instead of 1px black)
        this.boxx = Math.floor(x);
        this.boxy = Math.floor(y);
        this.boxwidth = Math.ceil(width);
        this.boxheight = Math.ceil(height);

        var bb = this.linegetterthrobber.bbox()
        this.linegetterthrobber.move(this.boxx + (this.boxwidth-bb.width) / 2,
                                     this.boxy + (this.boxheight-bb.height) / 2);

        this.redraw();
    },
    timechange: function () {
        this.trainbox.translate(
            this.boxx,this.boxy - this.display.time2y(this.display.starttime));

        this.traincliprect
            .size(this.boxwidth,this.boxheight)
            .move(0,this.display.time2y(this.display.starttime));

        //TODO: see if this has to be rate-limited (as with window.resize)
        this.reposition_train_labels();
    },
    redraw: function () {
        // size of internal drawing (covering the whole line)
        this.drawwidth = this.boxwidth / (this.xend-this.xstart)
        this.trainboxframe
            .size(this.boxwidth, this.boxheight)
            .move(this.boxx, this.boxy)
            .back();

        this.timechange();

        this.locaxis.g.translate(this.boxx, this.boxy-this.measures.locaxisoverbox);
        this.locaxis.bottom.translate(this.boxx, this.boxy + this.boxheight
            + this.measures.locaxisunderbox);
        this.pastblur.past
            .size(this.drawwidth, this.display.time2y(this.display.now))
            .move(this.pos2x(0), 0);
        this.pastblur.future
            .size(this.drawwidth, 999999)
            .move(this.pos2x(0), this.display.time2y(this.display.now));

        this.nowmarker.plot(this.pos2x(0),this.display.time2y(this.display.now),
                            this.pos2x(0)+this.drawwidth,this.display.time2y(this.display.now));

        this.linegetter.done(this.late_redraw.bind(this));
    },
    late_redraw: function () {
        // code that can only be run after this.line is loaded

        for ( var i in this.line.elements ) {
            var loc = this.line.elements[i];
            if ( loc.display_label ) {
                if (this.loc2pos(loc.id).within(this.xstart, this.xend)) {
                    var x = Math.round(this.pos2x(loc.id));
                    this.locaxis[loc.id].move(x, 0).show();
                    this.locmarkers[loc.id].plot(this.boxx+x, this.boxy,
                            this.boxx+x, this.boxy+this.boxheight).show();
                } else {
                    // chrome ignores the hide() when <use>d...
                    this.locaxis[loc.id].move(-100,-100).hide();
                    this.locmarkers[loc.id].move(-100,-100).hide();
                }
            }
        }

        this.fetch_trains();
    },
    reposition_train_labels: function () {
        for ( var tnr in this.trains ) {
            var train = this.trains[tnr];
            train.drawing.reposition_labels();
        }
    },
    fetch_trains: function () {
        var bb = this.graphdatafetcherthrobber.bbox()
        if ( this.display.oldstarttime != undefined
             && this.display.oldstarttime < this.display.starttime )
            this.graphdatafetcherthrobber.move(this.boxx + (this.boxwidth-bb.width) / 2,
                                           this.boxy + 5);
        else
            this.graphdatafetcherthrobber.move(this.boxx + (this.boxwidth-bb.width) / 2,
                                           this.boxy + this.boxheight-bb.height-5);
        this.graphdatafetcherthrobber.show();

        this.graphdatafetcher = $.getJSON(
            SCRIPT_ROOT + '/graphdata/' + this.linename + '.json',
            {
                'starttime': this.display.starttime,
                'endtime': this.display.endtime,
                'startpos': this.xstart,
                'endpos': this.xend,
            },
            (function (data) {
                this.graphdatafetcherthrobber.hide();
                for ( var tnr in this.trains )
                    this.trains[tnr]._unused = true;
                for ( var i in data.trains ) {
                    var train = data.trains[i];
                    var info = new ZWL.TrainInfo.from_object(train);
                    if ( train.nr in this.trains ) {
                        delete this.trains[train.nr]._unused;
                        this.trains[train.nr].info = info;
                        //TODO: only if timetable changed
                        this.trains[train.nr].drawing.update();
                    } else {
                        this.trains[train.nr] = {'info': info};
                        this.trains[train.nr].drawing = new ZWL.TrainDrawing(this, train.nr);
                    }
                }

                for ( var tnr in this.trains ) {
                    if ( this.trains[tnr]._unused ) {
                        console.log('delete unused train ' + tnr);
                        this.trains[tnr].drawing.remove();
                        delete this.trains[tnr];
                    }
                }
            }).bind(this)
        );
    },
    focustrain: function (trainnr) {
        if (trainnr in this.trains)
            this.trains[trainnr].drawing.focus();
    },
    unfocustrains: function () {
        $('.trainlabelg.selected, .trainpathg.selected').each(function () {
            // jquery doesn't really work inside svg
            this.classList.remove('selected');
        });
    },
    pos2x: function (id) {
        // allow values like xstart and xend as input
        if ( typeof(id) == 'number')
            return (id-this.xstart)*this.drawwidth;

        var elm = this.line.getElement(id);
        return (elm.pos-this.xstart) * this.drawwidth;
    },
    loc2pos: function(loc) {
        return this.line.getElement(loc).pos;
    },
    _parse_viewcfg: function (raw) {
        if ( raw.length == 0 )
            return {}
        if ( raw.length != 2 )
            throw new ZWL.ViewConfigParseError('expected 2 parameters, got ' + raw.length);

        var vc = {
            xstart: parseFloat(raw[0]),
            xend: parseFloat(raw[1]),
        }
        if ( vc.xstart === NaN || vc.xend === NaN)
            throw new ZWL.ViewConfigParseError('one of the parameters is NaN');
        return vc;
    },
    measures: {
        locaxisoverbox: 45,
        locaxisunderbox: 30,
        trainlabelxmargin: 7,
        trainlabelymargin: 4,
    }
};

ZWL.TimeAxis = function ( display ) {
    this.display = display;

    this.mask = this.display.svg.rect();
    this.svg = this.display.svg.group().clipWith(this.mask)
                                       .addClass('timeaxis');
    this.axis = this.svg.group().draggable(this.draggableconstraints)
                                .addClass('axis');
    this.bg = this.axis.rect().addClass('timeaxis-bg');

    this.zoombuttons = {}
    this.zoombuttons.g = this.svg.group().addClass('zoombuttons');
    this.zoombuttons.bg = this.zoombuttons.g.rect(55,30).addClass('bg');
    this.zoombuttons.plus = this.zoombuttons.g.group()
        .add(this.svg.rect(20,20))
        .add(this.svg.path('M 3,10 L 17,10 M 10,3 L 10,17'))
        .click(function() { display.timezoom *= Math.SQRT2; display.redraw(); });
    this.zoombuttons.minus = this.zoombuttons.g.group()
        .add(this.svg.rect(20,20))
        .add(this.svg.path('M 3,10 L 17,10'))
        .click(function() { display.timezoom /= Math.SQRT2; display.redraw(); });

    this.clock = {};
    this.clock.g = this.svg.group().addClass('clock');
    this.clock.text = this.clock.g.plain('00:00:00').move(0,0).center();
    this.clock.box = this.clock.text.addframe(5,5,true);

    var timeaxis = this; // `this` is overridden in dragging functions
    this.axis.dragstart = function (delta, event) {
        this.addClass('grabbing');
    }
    this.axis.dragmove = function (delta, event) {
        timeaxis.display.timechange(timeaxis.display.y2time((-this.transform().y)));
    };
    this.axis.dragend = function (delta, event) {
        this.removeClass('grabbing');
        timeaxis.display.redraw();
    };

    this.times = {}
}

ZWL.TimeAxis.prototype = {
    sizechange: function (x,y, width,height) {
        if (arguments.length < 4) console.error('not enough arguments');

        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.redraw();
    },
    timechange: function () {
        this.axis.translate(0, -this.display.time2y(this.display.starttime));
        var clockheight = this.clock.text.bbox().height/2;
        var clockpos = (this.display.now - this.display.starttime) * this.display.timezoom;
        clockpos = Math.min(this.height-clockheight, Math.max(clockheight, clockpos));
        this.clock.g.translate(this.width/2, clockpos);
    },
    redraw: function () {
        this.timechange();
        this.svg.translate(this.x,this.y);
        this.mask.size(this.width,this.height).move(0,0);

        this.clock.text
            .plain(timeformat(this.display.now, 'hms'))
            .center()
            .updateframe();

        // we draw everything about one extra screen height to the top and
        // bottom (for scrolling)
        this.bg.size(this.width*2,this.height*3)
               .move(-this.width/2, this.display.time2y(this.display.starttime) - this.height);
        for ( var time in this.times ) {
            this.times[time].remember('unused', true);
        }
        var onescreen = this.height / this.display.timezoom;
        var time = Math.floor((this.display.starttime - onescreen) / 60) * 60
        var end = time + 3*onescreen + 120;
        var t, text, line;
        for ( ; time < end; time += 60 ) {
            if ( !(time in this.times )) {
                t = this.times[time] = this.axis.group();
                if ( (time % 600) == 0 ) {
                    text = t.plain(timeformat(time, 'hm'));
                    text.move(20, -text.bbox().height / 2);
                    t.remember('text', text);
                }
                if ( (time % 300) == 0)
                    line = t.line(5,0, 15,0);
                else
                    line = t.line(10,0, 15,0);
                t.remember('line', line.attr('title', timeformat(time, 'hm')));
            }
            this.times[time].translate(0, this.display.time2y(time))
                            .remember('unused', null);
        }

        for ( time in this.times )
            if (this.times[time].remember('unused')) {
                this.times[time].remove();
                delete this.times[time];
            }

        this.zoombuttons.plus.translate(this.width-50,this.height-25);
        this.zoombuttons.minus.translate(this.width-25,this.height-25);
        this.zoombuttons.bg.translate(this.width-55,this.height-30);
    },

    draggableconstraints: function (x, y) {
        return {x: x == 0, y: true}; //TODO use end of timetable
    },
}

ZWL.TrainInfo = function (type, nr, segments, category, comment) {
    this.type = type;
    this.nr = nr;
    this.segments = segments;
    this.category = category;
    this.comment = comment;
    this.name = this.type + ' ' + this.nr.toString();
}
ZWL.TrainInfo.from_object = function (o) {
    return new ZWL.TrainInfo(o.type, o.nr, o.segments, o.category, o.comment);
}

ZWL.TrainDrawing = function (graph, trainnr) {
    this.graph = graph;
    this.train = graph.trains[trainnr];

    this.pathsvg = this.graph.trainpaths.group()
        .addClass('trainpathg').addClass('train' + this.train.info.nr)
        .attr('title', this.train.info.name);
    this._add_mousehandlers(this.pathsvg);

    this.labelsvg = this.graph.trainlabels.group()
        .addClass('trainlabelg').addClass('train'+ this.train.info.nr)
        .attr('title', this.train.info.name);

    // precreate label (used multiple times by the segments)
    var gm = this.graph.measures;
    this.label = {};
    this.label.g = this.labelsvg.group().addClass('trainlabel');
    this.label.nr = this.label.g.plain(this.train.info.nr.toString())
        .move(gm.trainlabelxmargin, gm.trainlabelymargin);
    var bb = this.label.nr.bbox();
    this.label.box = this.label.nr
        .addframe(gm.trainlabelxmargin, gm.trainlabelymargin);

    if ( this.train.info.category != null ) {
        this.pathsvg.addClass('category_' + this.train.info.category);
        this.labelsvg.addClass('category_' + this.train.info.category);
    }
    this._create_drawingsegments();
}

ZWL.TrainDrawing.prototype = {
    _create_drawingsegments: function () {
        this.segments = this.train.info.segments.map(function (segment) {
            return new ZWL.TrainDrawingSegment(this, segment);
        }.bind(this));
    },
    _add_mousehandlers: function () {
        for ( var i in arguments ) {
            arguments[i].on('mouseenter', this.mouseenter.bind(this));
            arguments[i].on('mouseleave', this.mouseleave.bind(this));
        }
    },
    reposition_labels: function () {
        this.segments.map(function (segment) { segment.reposition_labels(); });
    },
    update: function () {
        if ( this.train.info.segments.length != this.segments.length ) {
            this.segments.map(function (segment) { segment.remove(); });
            this._create_drawingsegments();
        } else {
            this.segments.map(function (segment) { segment.update(); });
        }
    },
    mouseenter: function () {
        this.graph.display.focustrain(this.train.info.nr);
    },
    mouseleave: function () {
        this.graph.display.unfocustrains();
    },
    focus: function () {
        this.pathsvg.addClass('selected').front();
        this.labelsvg.addClass('selected').front();
    },
    redraw: function () {
        this.segments.map(function (segment) { segment.redraw(); });
    },
    remove: function () {
        this.pathsvg.remove();
        this.labelsvg.remove();
        this.segments.map(function (segment) { segment.remove(); });
    },
}

ZWL.TrainDrawingSegment = function (drawing, segment) {
    this.drawing = drawing;
    this.graph = drawing.graph;
    this.display = drawing.graph.display;
    this.train = this.drawing.train;
    this.segment = segment;
    this.pathsvg = drawing.pathsvg;
    this.labelsvg = drawing.labelsvg;

    // bg = invisible, thicker path to allow easier pointing
    this.trainpath = this.pathsvg.group().addClass('trainpath')
        .clipWith(this.graph.trainclip)
        .maskWith(this.graph.pastblur.mask);
    this.trainpathbg = this.pathsvg.polyline().addClass('trainpathbg')
        .clipWith(this.graph.trainclip)
        .maskWith(this.graph.pastblur.mask);

    this.entrylabel = this.labelsvg.use(this.drawing.label.g);
    this.exitlabel = this.labelsvg.use(this.drawing.label.g);
    this.drawing._add_mousehandlers(this.entrylabel, this.exitlabel);

    this.update();
}

ZWL.TrainDrawingSegment.prototype = {
    update: function () {
        this.elements = [];

        var lastline = {};
        var laststop;
        for ( i in this.segment.timetable ) {
            var tte = this.segment.timetable[i]
            if ( tte.line ) {
                lastline = tte;
            } else if ( tte.loc ) {
                // lastline may be empty as line timetable elements are optional
                if ( laststop ) {
                    this.elements.push({
                        'line': lastline.line,
                        'opposite': lastline.opposite,
                        'start': laststop.loc,
                        'dep_real': laststop.dep_real,
                        'end': tte.loc,
                        'arr_real': tte.arr_real,
                    });
                }
                this.elements.push({
                    'loc': tte.loc,
                    'arr_real': tte.arr_real,
                    'dep_real': tte.dep_real,
                });
                laststop = tte;
                lastline = {}
            }
        }

        this.redraw();
    },
    redraw: function () {
        this.trainpath.clear();

        // check if the segment is completely out of the box and we don't need
        // to draw it at all
        var outside = true;
        for ( var i in this.elements ) {
            var elem = this.elements[i];
            if ( 'loc' in elem && this.graph.loc2pos(elem.loc).between(this.graph.xstart, this.graph.xend) ) {
                outside = false;
                break;
            }
        }
        // draw trainpath, calculate coordinates (for bg and label positioning)
        this.coordinates = [];
        if ( !outside )
            for ( var i in this.elements ) {
                var elem = this.elements[i];
                if ( 'line' in elem ) {
                    var x1 = this.graph.pos2x(elem.start);
                    var y1 = this.display.time2y(elem.dep_real);
                    var x2 = this.graph.pos2x(elem.end);
                    var y2 = this.display.time2y(elem.arr_real);

                    this.coordinates.push([x1, y1], [x2, y2]);

                    elem.path = this.trainpath.line(x1, y1, x2, y2);
                    if ( elem.opposite == true ) elem.path.addClass('opposite');

                } else if ( 'loc' in elem
                        && elem.arr_real != null
                        && elem.dep_real != null
                        && elem.arr_real != elem.dep_real ) {

                    var x = this.graph.pos2x(elem.loc);
                    var y1 = this.display.time2y(elem.arr_real);
                    var y2 = this.display.time2y(elem.dep_real);

                    elem.path = this.trainpath.line(x, y1, x, y2);
                    this.coordinates.push([x, y1], [x, y2]);
                }
            }
        this.trainpathbg.plot(this.coordinates);

        this.reposition_labels();
    },
    reposition_labels: function () {
        this.reposition_label('entry', this.entrylabel);
        this.reposition_label('exit', this.exitlabel);
    },
    reposition_label: function (mode, label) {
        var coordinates;
        if ( mode == 'entry') {
            coordinates = this.coordinates;
        } else if ( mode == 'exit') {
            // same, we just search in the other direction
            coordinates = this.coordinates.slice().reverse();
        } else {
            return console.error('no such mode: ' + mode);
        }

        var x = y = orientation = null;

        // leave those vars null if the segment is not to be drawn
        if ( coordinates.length == 0 ) {
        }
        // first, check the simple case: train start/stops within graph
        // this avoids calculating tons of intersections where there are none.
        // (remember `coordinates` is reversed in the `exit` case.)
        else if ( coordinates[0][1].within(
                    this.display.time2y(this.display.starttime),
                    this.display.time2y(this.display.endtime))
                && coordinates[0][0].within(
                    this.graph.pos2x(this.graph.xstart),
                    this.graph.pos2x(this.graph.xend)) ) {
            //TODO use `[x,y] =` as soon as chrome supports it. same further below
            x = coordinates[0][0];
            y = coordinates[0][1];
            if ( mode == 'entry' )
                orientation = this.segment.direction == 'left' ? 'right' : 'left';
            else
                orientation = this.segment.direction;
        }
        //TODO prevent execution of the else branch when the train is entirely outside the box
        // (happens rarely however (only when changing the time) because
        //  the backend does only return "in-graph" trains.)
        else {
            var x1, y1, x2, y2, int_x, int_y;
            var left_x = this.graph.pos2x(this.graph.xstart);
            var right_x = this.graph.pos2x(this.graph.xend);
            var top_y = this.display.time2y(this.display.starttime);
            var bottom_y = this.display.time2y(this.display.endtime);

            for ( var i = 1; i < coordinates.length; i++ ) {
                x1 = coordinates[i-1][0];
                y1 = coordinates[i-1][1];
                x2 = coordinates[i][0];
                y2 = coordinates[i][1];

                // intersection with top / bottom / left / right edge, respectively
                if ( mode == 'entry' ) {
                    if ( int_x = intersecthorizseg(top_y, left_x, right_x, x1,y1,x2,y2) ) {
                        x = int_x, y = top_y, orientation = 'top'; break;
                    }
                } else {
                    if ( int_x = intersecthorizseg(bottom_y, left_x, right_x, x1,y1,x2,y2) ) {
                        x = int_x, y = bottom_y, orientation = 'bottom'; break;
                    }
                }
                if ( this.segment.direction == 'right' ? mode == 'entry' : mode == 'exit' ) {
                    if ( int_y = intersectvertseg(left_x, top_y, bottom_y, x1,y1,x2,y2) ) {
                        x = left_x, y = int_y, orientation = 'left'; break;
                    }
                } else /* (dir=right and mode=exit) or (dir=left and mode entry) */ {
                    if ( int_y = intersectvertseg(right_x, top_y, bottom_y, x1,y1,x2,y2) ) {
                        x = right_x, y = int_y, orientation = 'right'; break;
                    }
                }
            }
        }

        if ( x == null || y == null || orientation == null ) {
            label.hide();
        } else {
            label.show();
            x = Math.floor(x); y = Math.floor(y); // avoid lines "between pixels"
            var bb = label.bbox();
            if ( orientation == 'left') {
                label.translate(x-bb.width-5,y-bb.height/2);
            } else if ( orientation == 'right') {
                label.translate(x+5,y-bb.height/2);
            } else if ( orientation == 'top') {
                label.translate(x-bb.width/2,y-bb.height-5);
            } else if ( orientation == 'bottom') {
                label.translate(x-bb.width/2,y+5);
            }
        }
    },

    remove: function () {
    },
}

ZWL.LineConfiguration = function (obj) {
    this.name = obj.name;
    this.elements = obj.elements;
    this.elements_by_id = {};
    for ( var i in this.elements ) {
        var e = this.elements[i];
        this.elements_by_id[e.id] = e;
    }
}

ZWL.LineConfiguration.prototype = {
    getElement: function ( id ) {
        return this.elements_by_id[id];
    },
}

ZWL.ViewConfig = function (method, allargs) {
    this.method = method;

    // extract special args common to all methods
    this.args = [];
    for ( var i = 0; i < allargs.length; i++) {
        var a = allargs[i];
        if ( a == '' )
            continue;
        else if ( a.substr(0,3) == 'tz=' )
            this.timezoom = parseFloat(a.substr(3));
        else
            this.args.push(a);
    }

    if ( method == 'gt' || method == 'tg' ) {
        if ( this.args.length != 1 )
            throw new ZWL.ViewConfigParseError('Erwarte 1 Parameter, nicht ' + this.args.length);
        this.graphs = [this.args[0]];
    } else if ( ['tgg', 'gtg', 'ggt'].indexOf(method) > -1 ) {
        if ( this.args.length != 3 )
            throw new ZWL.ViewConfigParseError('Erwarte 3 Parameter, nicht ' + this.args.length);
        this.graphs = [this.args[0], this.args[2]];
        this.proportion = parseInt(this.args[1]) / 100; // url param is percent
        if ( isNaN(this.proportion) || this.proportion < 0 || this.proportion > 1 )
            throw new ZWL.ViewConfigParseError('zweiter Parameter muss zwischen 0 und 100 sein');
    } else {
        throw new ZWL.ViewConfigParseError('Ungültige Ansichtskonfiguration: ' + method);
    }
}
ZWL.ViewConfig.prototype = {
    apply: function (display) {
        display.graphs = []
        this.graphs.map(function(g) {
            display.graphs.push(ZWL.Graph.from_string(display, g));
        });
        if ( this.timezoom != undefined )
            display.timezoom = this.timezoom;
    },
    sizechange: function (display, width, height) {
        var dm = display.measures;
        var innerheight = height - dm.graphtopmargin - dm.graphbottommargin;
        if ( this.method == 'gt' ) {
            display.graphs[0].sizechange(dm.graphhorizmargin, dm.graphtopmargin,
                width-dm.timeaxiswidth-dm.graphhorizmargin*2, innerheight);
            display.timeaxis.sizechange(width-dm.timeaxiswidth, dm.graphtopmargin,
                dm.timeaxiswidth, innerheight);
        }
        if ( this.method == 'tg' ) {
            display.timeaxis.sizechange(0, dm.graphtopmargin,
                dm.timeaxiswidth, innerheight);
            display.graphs[0].sizechange(dm.timeaxiswidth+dm.graphhorizmargin+dm.horizdistance, dm.graphtopmargin,
                width-dm.timeaxiswidth-2*dm.graphhorizmargin, innerheight);
        } else if ( ['tgg', 'gtg', 'ggt'].indexOf(this.method) > -1 ) {
            var graphswidth = width - dm.timeaxiswidth - 4*dm.graphhorizmargin - dm.horizdistance;
            var firstgraphwidth = Math.min(
                Math.max(graphswidth * this.proportion, dm.graphminwidth),
                graphswidth - dm.graphminwidth);
            if ( this.method == 'ggt' ) {
                display.graphs[0].sizechange(dm.graphhorizmargin, dm.graphtopmargin,
                    firstgraphwidth, innerheight);
                display.graphs[1].sizechange(firstgraphwidth+dm.horizdistance+3*dm.graphhorizmargin, dm.graphtopmargin,
                    graphswidth-firstgraphwidth, innerheight);
                display.timeaxis.sizechange(width-dm.timeaxiswidth, dm.graphtopmargin,
                    dm.timeaxiswidth, innerheight);
            } else if ( this.method == 'gtg' ) {
                display.graphs[0].sizechange(dm.graphhorizmargin, dm.graphtopmargin,
                    firstgraphwidth, innerheight);
                display.timeaxis.sizechange(firstgraphwidth+2*dm.graphhorizmargin+dm.horizdistance, dm.graphtopmargin,
                    dm.timeaxiswidth, innerheight);
                display.graphs[1].sizechange(firstgraphwidth+3*dm.graphhorizmargin+2*dm.horizdistance+dm.timeaxiswidth, dm.graphtopmargin,
                    graphswidth-firstgraphwidth, innerheight);
            } else if ( this.method == 'tgg' ) {
                display.timeaxis.sizechange(0, dm.graphtopmargin,
                    dm.timeaxiswidth, innerheight);
                display.graphs[0].sizechange(dm.timeaxiswidth+dm.horizdistance+dm.graphhorizmargin, dm.graphtopmargin,
                    firstgraphwidth, innerheight);
                display.graphs[1].sizechange(firstgraphwidth+3*dm.graphhorizmargin+2*dm.horizdistance+dm.timeaxiswidth, dm.graphtopmargin,
                    graphswidth-firstgraphwidth, innerheight);
            }
        }
    },
}
ZWL.ViewConfigParseError = function (msg) {
    this.msg = msg;
}

// HELPERS

function defaultval(val, def) {
    return val === undefined ? def : val;
}

function coalesce() {
    for(var i in arguments)
        if (arguments[i] !== null && arguments[i] !== undefined)
            return arguments[i];
    return null;
}

function timeformat (time, format) {
    var d = new Date(time*1000);
    var min = d.getMinutes();
    var sec = d.getSeconds();
    if ( format == 'hm') {
        if ( min < 10 ) min = '0' + min
        return d.getHours() + ':' + min;
    } else if ( format == 'hms' ) {
        if ( min < 10 ) min = '0' + min
        if ( sec < 10 ) sec = '0' + sec
        return d.getHours() + ':' + min + ':' + sec;
    } else {
        console.error('invalid format given');
    }
}

if (!Number.between) {
    Object.defineProperty(Number.prototype, 'between', {
        enumerable: false,
        value: function (a, b) {
            return this > a && this < b;
        },
    });
}

if (!Number.within) {
    Object.defineProperty(Number.prototype, 'within', {
        enumerable: false,
        value: function (a, b) {
            return this >= a && this <= b;
        },
    });
}

function intersecthorizseg(y, xa, xb, x1, y1, x2, y2) {
    // Calculate the x coordinate of the point were the line segment between
    // x1,y1 and x2,y2 intersects with the line segment from xa,y to xb,y.
    // If they don't intersect, return null.
    // It is required that xa < xb.

    // avoid complex calculations when they clearly don't intersect
    if ( Math.max(x1, x2) < xa || Math.min(x1, x2) > xb
         || Math.max(y1, y2) < y || Math.min(y1, y2) > y)
        return null;

    // equation deduced from P(t) = (x1+t*(x2-x1), y1+t*(y2-y1))
    var int_x = x1 + (y-y1)*(x2-x1)/(y2-y1);
    if (int_x + 0.000001 < xa || int_x - 0.000001 > xb)
        return null;

    return int_x;
}
function intersectvertseg(x, ya, yb, x1, y1, x2, y2) {
    // Calculate the y coordinate of the point were the line segment between
    // x1,y1 and x2,y2 intersects with the line segment from x,ya to x,yb.
    // If they don't intersect, return null.
    // It is required that ya < yb.
    return intersecthorizseg(x, ya, yb, y1, x1, y2, x2);
}

SVG.extend(SVG.Text, {
    hcenter: function() {
        return this.translate(-this.bbox().width / 2, 0);
    },
    vcenter: function() {
        return this.translate(0, -this.bbox().height / 2);
    },
    center: function() {
        var bb = this.bbox();
        return this.translate(-bb.width/2, -bb.height/2);
    },
    addframe: function(xmargin, ymargin, usetransform) {
        if ( typeof usetransform === 'undefined' ) usetransform = false;
        this.frameoptions = {
            xmargin: xmargin,
            ymargin: ymargin,
            usetransform: usetransform,
            element: this.parent.rect(0,0).back(),
        }
        this.updateframe();
        return this.frameoptions.element;
    },
    updateframe: function() {
        if ( this.frameoptions.usetransform )
            var bb = this.bbox();
        else
            var bb = this.node.getBBox();

        this.frameoptions.element
            .width(bb.width + this.frameoptions.xmargin*2)
            .height(bb.height + this.frameoptions.ymargin*2)
            .move(bb.x - this.frameoptions.xmargin,
                  bb.y - this.frameoptions.ymargin);
        return this;
    },
});
