define([
        'dojo/Evented',
        'dojo/_base/declare',
        'dojo/_base/event',
        'dojo/_base/lang',
        'dojo/dom', 
        'dojo/dom-class',
        'dojo/dom-construct',
        'dojo/on',
        'dojo/query',
        'dijit/layout/ContentPane',
        'dijit/registry',
        'esri/geometry/mathUtils',
        'esri/tasks/query',
        'esri/tasks/QueryTask',
        'application/Symbology',
        'esri/geometry/Polygon',
        'esri/geometry/screenUtils',
        'esri/geometry/ScreenPoint',
        'esri/geometry/Extent'
    
   ],function(
        Evented,
        declare, 
        event,
        lang, 
        dom, 
        domClass, 
        domConstruct, 
        on,
        query,
        ContentPane,
        registry,
        mathUtils,
        Query,
        QueryTask,
        SymbolControler,
        Polygon,
        screenUtils,
        ScreenPoint,
        Extent
){
   
   var proximityInfo = declare('ProximityInfo', [Evented], {

      config : null,
      map : null,
      location : null,
      container : null,
      pageObj : null,
      symbology:null,
      lastSelected: undefined,
      controlField: null,
      selectedNum: null,

      constructor : function(config) {
         this.config = config;
         this.symbology = new SymbolControler({folderUrl: "./images/symbols"});
         this.symbology.startup();
      },

      // update for location
      updateForLocation : function(location, container, pageObj) {
         this.location = location;
         this.container = container;
         this.container.innerHTML = "<br/><br/><img src='images/ajax-loader.gif'/>";
         this.pageObj = pageObj;
         this.controlField = pageObj.layer.objectIdField;
         this._unselectRecords();

         var layerType = pageObj.layerType;

         if (layerType == "Feature Layer") {
            this._queryFeatures();
         } else {
            this._filterFeatures();
         }
      },

      // query features
      _queryFeatures : function() {
          var tr = screenUtils.toMapPoint(this.map.extent, this.map.width, this.map.height, new ScreenPoint(this.map.width-350,0));
          var bl = screenUtils.toMapPoint(this.map.extent, this.map.width, this.map.height, new ScreenPoint(0,this.map.height));
          var newExtent = new Extent(bl.x, bl.y, tr.x, tr.y, bl.spatialReference);
          if(this.map.width<=500)
              newExtent = this.map.extent;
         var layer = this.pageObj.layer;
         var url = layer.url + "?ts=" + new Date().getTime();
         var queryTask = new QueryTask(url);
         var query = new Query();
         query.outFields = ["*"];
         query.returnGeometry = true;
         var defExp = this.pageObj.defExp;
         if (layer.getDefinitionExpression) {
            defExp = layer.getDefinitionExpression();
         } else if (layer.definitionExpression) {
            defExp = layer.definitionExpression;
         }
         if (defExp) {
            query.where = defExp;
         }
         query.geometry = Polygon.fromExtent(newExtent);
         query.spatialRelationship = Query.SPATIAL_REL_INTERSECTS;
         queryTask.execute(query, lang.hitch(this, this._resultsHandler), lang.hitch(this, this._errorHandler));
      },

      // filter features
      _filterFeatures : function() {
          var tr = screenUtils.toMapPoint(this.map.extent, this.map.width, this.map.height, new ScreenPoint(this.map.width-350,0));
          var bl = screenUtils.toMapPoint(this.map.extent, this.map.width, this.map.height, new ScreenPoint(0,this.map.height));
          var buffer = new Extent(bl.x, bl.y, tr.x, tr.y, bl.spatialReference);
          if(this.map.width<=500)
              buffer = this.map.extent;
         var layer = this.pageObj.layer;
         var features = [];
         for (var i = 0; i < layer.graphics.length; i++) {
            var gra = layer.graphics[i];
            var geom = gra.geometry;
            var pt = geom;
            if (geom.type != "point")
               pt = this._getPointForGeometry(geom);
            if (buffer.contains(pt)) {
               features.push(gra);
            }
         }
         this._resultsHandler({
            features : features
         });
      },

      // results handler
      _resultsHandler : function(results) {
         this.container.innerHTML = "";

         var proximityFeatures = [];
         var features = results.features;
         if (features.length > 0) {

            // process features
            for (var i = 0; i < features.length; i++) {
               var gra = features[i];
               var geom = gra.geometry;
               var pt = geom;
               if (geom.type != "point")
                  pt = this._getPointForGeometry(geom);
               var dist = this._getDistance(pt);
               gra.attributes.DISTANCE = dist;
               gra.attributes.POINT_LOCATION = pt;
               gra.setInfoTemplate(this.pageObj.layer.infoTemplate);
               proximityFeatures.push(gra);
            }

            // sort by distance
            this.pageObj.proximityFeatures = proximityFeatures.slice();

            // create content
            var content = domConstruct.create("div", {
            }, this.container);
            domClass.add(content, 'resultsContent');

            var indexSelected;
             
            for (var i = 0; i < proximityFeatures.length; i++) {
               var feature = proximityFeatures[i];
               var geom = feature.geometry;
                
               var num = i + 1;
               var symbol = this.symbology.getImage(feature);
               if(symbol)
                   num = symbol.outerHTML;
               
               //rec
               var rec = domConstruct.create("div", {
                  id : 'rec_' + this.pageObj.id + '_' + i
               }, content);
               domClass.add(rec, 'recProximity');
               
               //header
               var recHeader = domConstruct.create("div", {
               }, rec);
               domClass.add(recHeader, 'recHeader');
               feature.id = 'rec_' + this.pageObj.id + '_' + i;
               on(recHeader, "click", lang.hitch(this, this.selectByAttribute, feature, true));
               
               // num
               var recNum = domConstruct.create("div", {
                  innerHTML : num
               }, recHeader);
               if(symbol)
                   recNum.style = "";
                else
                   recNum.style = "background-color:" + this.pageObj.color;
               domClass.add(recNum, 'recNum');
               
               //headerInfo
               var recHeaderInfo = domConstruct.create("div", {
               }, recHeader);
               domClass.add(recHeaderInfo, 'recHeaderInfo');

               // info
               var info = feature.getTitle();
               if (info === "") {
                  info = this.pageObj.label;
               }
               
               recHeaderInfo.innerHTML = info;

               //body
               var recBody = domConstruct.create("div", {
                  id : 'recBody_' + this.pageObj.id + '_' + i
               }, rec);
               domClass.add(recBody, 'recBody');
               
               if(this.lastSelected && feature.attributes[this.controlField]===this.lastSelected.attributes[this.controlField]){
//                   console.log("feature", feature, feature.attributes[this.controlField]);
//                   console.log("lastSelected", this.lastSelected, this.lastSelected.attributes[this.controlField]);
                   indexSelected = i;
               }
                
            }

         }
         dom.byId("pageCounter_" + this.pageObj.id).innerHTML = proximityFeatures.length;
         this.emit('updated', {
            data : proximityFeatures
         });
           if(indexSelected>=0){
               this._selectRecord(indexSelected, false);
           }
           
      },

      // error handler
      _errorHandler : function(error) {
         this.container.innerHTML = "";
         domConstruct.create("div", {
            innerHTML : error.message
         }, this.container);
         this.emit('updated', {
            data : null
         });
      },

      // get point for geometry
      _getPointForGeometry : function(geom) {
         if (geom.type == "polygon")
            return geom.getCentroid();
         if (geom.type == "polyline") {
            var pathNum = Math.floor(geom.paths.length / 2);
            var ptNum = Math.floor(geom.paths[pathNum].length / 2);
            return geom.getPoint(pathNum, ptNum);
         }
         return geom.getExtent().getCenter();
      },


      // get distance
      _getDistance : function(loc) {
         var dist = 0;
         dist = mathUtils.getLength(this.location, loc) * 0.000621371;
         if (this.config.distanceUnits == "kilometers")
            dist = dist * 1.60934;
         return dist;
      },

      // zoom to location
      _zoomToLocation : function(gra) {
         var loc = gra.attributes.POINT_LOCATION;
         this.map.centerAndZoom(loc, this.config.defaultZoomLevel || 14);
      },

      // route to location
      _routeToLocation : function(loc) {
         if (this.config.showDirections)
            this.emit('route', {
               data : loc
            });
      },

      // compare distance
      _compareDistance : function(a, b) {
         if (a.attributes.DISTANCE < b.attributes.DISTANCE)
            return -1;
         if (a.attributes.DISTANCE > b.attributes.DISTANCE)
            return 1;
         return 0;
      },

      // Select Feature
      selectFeature : function(gra, zoom) {
         this.lastSelected = gra;              
         var num = gra.id;
         num = num.replace("R_", "").replace("T_", "");
         this._selectRecord(parseInt(num), zoom);
      },
      
      // Select Record
      _selectRecord : function(num, zoom) {
         if(typeof(zoom)==='undefined') {
            zoom = true;
         }
         this._unselectRecords();
         if (num != this.selectedNum) {
            this._highlightRecord(num, zoom);
//         } else {
//            this.selectedNum = null;
//            this.lastSelected = undefined;
//            this.emit('highlight', {
//               data : null
//            });
         }
      },
       
      selectByAttribute : function(obj, zoom) {
        var gras = this.map.graphics.graphics;
        for(var i =0 ; i<gras.length; i++){
            if(obj.attributes[this.controlField]===gras[i].attributes[this.controlField])
                this.selectFeature(gras[i], zoom);
        }
		return null;
      },
      
      // Highlight Record
      _highlightRecord : function(num, zoom) {
         this.selectedNum = num;
         if (this.pageObj.proximityFeatures) {
            var gra = this.pageObj.proximityFeatures[num];
            
            if(this.map.extent.contains(gra.geometry)){
                console.log("IN");
                
             
                this.emit('highlight', {
                   data : gra
                });
                if (zoom)
                   this._zoomToLocation(gra);
                var rec = dom.byId("rec_" + this.pageObj.id + "_" + num);
                if (rec) {
                   domClass.add(rec, "recOpened");
                   var recB = dom.byId("recBody_" + this.pageObj.id + "_" + num);
                   var recDetails = domConstruct.create("div", {
                      id: "recDetails"
                   }, recB);
                   domClass.add(recDetails, "recDetails");
                   var cp = new ContentPane({
                      id: "recPane"
                   });
                   cp.placeAt('recDetails', 'last');
                   cp.startup();
                   var content = gra.getContent();
                   registry.byId("recPane").set("content", content);
                   if (!zoom) {
                      setTimeout(lang.hitch(this, this._updatePosition), 300);
                   }
                }
            }else{
                console.log('OUT');
                this.lastSelected = undefined;
                this.selectedNum = null;
            }
         }
      },
      
      // Select Route
      _selectRoute : function(num, evt) {
         event.stop(evt);
         this._showRoute(num);
      },
      
      // Show Route
      _showRoute : function(num) {
         this._unselectRecords();
         this._highlightRecord(num, true);
         var gra = this.pageObj.proximityFeatures[num];
         this._routeToLocation(gra.attributes.POINT_LOCATION);
      },

      // Unselect Records
      _unselectRecords : function() {
         if (registry.byId("recPane"))
            registry.byId("recPane").destroy();
         domConstruct.destroy("recDetails");
         query(".recOpened").forEach(function(node) {
            domClass.remove(node, "recOpened");
         });
      },

      // Update Position
      _updatePosition : function() {
         var num = this.selectedNum;
         var pos = num * 60;
         this.container.scrollTop = pos;
      },
      
      // Update Selection
      updateSelection : function() {
         this._unselectRecords();
         if (this.pageObj && this.selectedNum && this.selectedNum >= 0) {
            var num = this.selectedNum;
            this._unselectRecords();
            this._highlightRecord(num, false);
         }
            
      },

      // Clear Selection
      clearSelection : function() {
         this.selectedNum = null;
         this._unselectRecords();
      }
      
   });

   return proximityInfo;

}); 
