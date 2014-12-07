ZWL = {};

ZWL.Display = function (element, graphinfo, timezoom) {
    this.svg = SVG(element);

    this.timezoom = defaultval(timezoom, .2);
    this.now = 13092180;
    
    this.graphs = [
        new ZWL.Graph(this, 'ring-xde', {})
    ];

    this.sizechange($(document).width()-100, $(document).height()-100)
};

ZWL.Display.prototype = {
    sizechange: function (width,height) {
        this.svg.size(width,height);

        //for (g in graphs) ...
        this.graphs[0].sizechange(10,10,width-10,height-10);
    },
    time2y: function (time) {
        var d = new Date(defaultval(time, this.now)*1000);
        //TODO: base on start of session or something not epoch
        return this.timezoom * (d.getDay()*86400 + d.getHours()*3600 +
                                d.getMinutes()*60 + d.getSeconds());
    },
};


ZWL.Graph = function (display, strecke, viewcfg) {
    this.display = display;
    //TODO: fetch real strecke detail
    this.strecke = ringxde;
    this.xstart = defaultval(viewcfg.xstart, 0);
    this.xend = defaultval(viewcfg.xend, 1);
    this.trains = {};
    this.svg = this.display.svg.group();
    this.nowmarker = this.svg.line(-1,-1,-1,-1);
};

ZWL.Graph.prototype = {
    sizechange: function (x,y, width,height) {
        if (arguments.length < 4) console.error('not enough arguments');
        // position and dimensions of visible area
        this.x = x;
        this.y = y;
        this.viswidth = width;
        this.visheight = height;
        this.redraw();
    },
    redraw: function () {
        // size of internal drawing (covering the whole strecke)
        this.drawwidth = this.viswidth / (this.xend-this.xstart)
        this.svg.transform({'y':-this.display.time2y(this.display.now-600)});

        this.fetch_trains();

        this.nowmarker.plot(0, this.display.time2y(), this.drawwidth, this.display.time2y());
        for ( tid in this.trains ) {
            var train = this.trains[tid];
            if ( train.status == 'deleted' ) {
                train.drawing.remove();
            } else if ( train.status == 'new') {
                train.drawing = new ZWL.TrainDrawing(this, train);
            } else if ( train.status == 'updated') {
                train.drawing.redraw();
            }
        }
    },
    fetch_trains: function () {
        if ( !this.trains.length ) {
            this.trains = {
                406: {'info':ice406, 'status':'new'},
                2342: {'info':ire2342, 'status':'new'},
            }
        }
    },
    stop2x: function (code) {
        var elm;
        for ( i in this.strecke.elements ) {
            elm = this.strecke.elements[i];
            if ( elm.code == code )
                return elm.pos * this.drawwidth;
        }
        console.error('no such stop: ' + code);
    },
};

ZWL.TrainInfo = function (gattung, nr, timetable, comment) {
    this.gattung = gattung;
    this.nr = nr;
    this.timetable = timetable;
    this.comment = comment;
    this.name = this.gattung + ' ' + this.nr.toString();
}

ZWL.TrainDrawing = function (graph, train) {
    this.graph = graph;
    this.train = train;
    this.svg = this.graph.svg.group()
        .addClass('train' + train.info.nr)
        .attr('title', train.info.name);
    this.trainline = this.svg.polyline([[-1,-1]]).attr('title', this.train.info.name);
    this.redraw();
}

ZWL.TrainDrawing.prototype = {
    redraw: function () {
        var tt = this.train.info.timetable;
        var points = [];
        for ( elm in tt ) {
            if ( tt[elm]['loc'] ) {
                if ( tt[elm]['arr_real'] != undefined )
                    points.push([this.graph.stop2x(tt[elm]['loc']),
                                 this.graph.display.time2y(tt[elm]['arr_real'])]);
                if ( tt[elm]['dep_real'] != undefined &&
                     tt[elm]['dep_real'] != tt[elm]['arr_real'] )
                    points.push([this.graph.stop2x(tt[elm]['loc']),
                                 this.graph.display.time2y(tt[elm]['dep_real'])]);

                this.trainline.plot(points);
                laststop = tt[elm];
            }
        }
    },
    remove: function () {
        this.svg.remove();
    },
}


// some data for playing around (later to be fetched from the server)

ringxde = {
    'elements': [
        {'type':'bhf', 'code':'XDE#1', 'pos':0, 'name':'Derau'},
        {'type':'str', 'code':'XDE#1_XCE#1', 'pos':.15, 'length':3000, 'tracks':2},
        {'type':'bhf', 'code':'XCE#1', 'pos':.3, 'name':'Cella'},
        {'type':'str', 'code':'XCE#1_XWF#1', 'pos':.4, 'length':2000, 'tracks':2},
        {'type':'bhf', 'code':'XWF#1', 'pos':.5, 'name':'Walfdorf'},
        {'type':'str', 'code':'XWF#1_XDE#2', 'pos':.75, 'length':5000, 'tracks':2},
        {'type':'bhf', 'code':'XDE#2', 'pos':1, 'name':'Derau'},
    ],
};
ice406 = new ZWL.TrainInfo('ICE', 406, [
    {'loc':'XDE#1', 'arr_real':null, 'dep_real':13091820},
    {'str':'XDE#1_XCE#1'},
    {'loc':'XCE#1', 'arr_real':13092000, 'dep_real':13092060},
    {'str':'XCE#1_XWF#1'},
    {'loc':'XWF#1', 'arr_real':13092240, 'dep_real':13092300},
    {'str':'XWF#1_XDE#2'},
    {'loc':'XDE#2', 'arr_real':13092420, 'dep_real':null},
])
ire2342 = new ZWL.TrainInfo('IRE', 2342, [
    {'loc':'XDE#2', 'arr_real':null, 'dep_real':13092300},
    {'str':'XWF#1_XDE#2'},
    {'loc':'XWF#1', 'arr_real':13092540, 'dep_real':13092600},
])

function defaultval(val, def) {
    return val === undefined ? def : val;
}
