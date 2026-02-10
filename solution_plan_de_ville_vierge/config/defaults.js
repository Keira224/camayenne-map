/*global define,location */
/*jslint sloppy:true */
/*
 | Copyright 2014 Esri
 |
 | Licensed under the Apache License, Version 2.0 (the "License");
 | you may not use this file except in compliance with the License.
 | You may obtain a copy of the License at
 |
 |    http://www.apache.org/licenses/LICENSE-2.0
 |
 | Unless required by applicable law or agreed to in writing, software
 | distributed under the License is distributed on an "AS IS" BASIS,
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 | See the License for the specific language governing permissions and
 | limitations under the License.
 */
define({
    //Default configuration settings for the application. This is where you'll define things like a bing maps key,
    //default web map, default app color theme and more. These values can be overwritten by template configuration settings and url parameters.
    "appid": "",
    "webmap": "8ba156a09cd84450a2219b663564e4b9",
    "oauthappid": null,
    //Group templates must support a group url parameter. This will contain the id of the group.
    //group: "",
    //Enter the url to the proxy if needed by the application. See the 'Using the proxy page' help topic for details
    //http://developers.arcgis.com/en/javascript/jshelp/ags_proxy.html
    "proxyurl": "proxy.php",
    "bingKey": "", //Enter the url to your organizations bing maps key if you want to use bing basemaps
    //Defaults to arcgis.com. Set this value to your portal or organization host name.
    "sharinghost": location.protocol + "//" + "www.arcgis.com",
    //When true the template will query arcgis.com for default settings for helper services, units etc. If you
    //want to use custom settings for units or any of the helper services set queryForOrg to false then enter
    //default values for any items you need using the helper services and units properties.
    "queryForOrg": true,
    //If you need localization set the localize value to true to get the localized strings
    //from the javascript/nls/resource files.
    //Note that we've included a placeholder nls folder and a resource file with one error string
    //to show how to setup the strings file.
    "localize": true,
    "units": null,
    
    // **************************** //
    // ** UI SPECIFIC PARAMETERS ** //
    "cycleColors": true,
    "color": "#80ab00",
    "colors": ["#0071ab", "#c263d4", "#b18d75", "#1951ec", "#19bf2b", "#ff891f", "#24d9b8", "#558663", "#878f9f", "#f34749", "#f607c0", "#33b49d", "#eccd00", "#097096"],
    "logo" : "images/logo.png",
    "title": "Camayenne Map",
    
    // **************************** //
    
    // **************************** //
    // ** LOCAL PERSPECTIVE PARAMETERS **//
    "showDemographics": false,
    "demographicsLabel": "Demographics",
    //"demographicsURL": "http://services.arcgisonline.com/arcgis/rest/services/Demographics/USA_Percent_Under_18/MapServer/1",
    //"demographicsFields": "TOTPOP_CY,POPL18_CY,POP65U_CY",
    //"demographicsAliases": "2012 Total Population,2012 Population Under 18 Years,2012 Population Over 65 Years",
    "demographicsURL": location.protocol + "//services.arcgis.com/80hk79qB8z45zcHi/ArcGIS/rest/services/US_Block_Group_Points/FeatureServer/0",
    "demographicsFields": "POP2010,MALES,FEMALES,HSE_UNITS",
    "demographicsAliases": "2010 Total Population,Male Population,Female Population,Housing Units",
    "showLifestyle": false,
    "lifestyleLabel": "Lifestyle",
    "lifestyleURL": location.protocol + "//services.arcgisonline.com/arcgis/rest/services/Demographics/USA_Tapestry/MapServer/1",
    "showWeather": false,
    "weatherLabel": "Weather",
    "weatherURL": location.protocol + "//api.worldweatheronline.com/free/v1/weather.ashx?format=json&num_of_days=3&extra=localObsTime&key=63hkyhwzpks3a3kj9k9jdfeg", // URL to free weather API information with your access token
    "weatherLayerURL_Tiled" : "https://gisserver.accuweather.com/ESRITileServices2/tileRequest/AccuTileServices/LatestUSHiResRadar/N1dvRW9KUjNNK2tYWFp4Y1h6M2lCa2ZTRW5wMWJzeXdaamxIY3ZkRmcxVCs1YXdPaE1MckpBPT0=/MapServer/tile/{level}/{row}/{col}",
    "weatherLayerURL_WMS" : location.protocol + "//mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi?SERVICE=WMS", // URL for WMS weather layer.
    "weatherUnits": "C", // options: F or C
    "showDirections": false,
    "directionsLabel": "Directions",
    "directionsURL": null,
    "distanceUnits": "kilometers", // options: miles or kilometers
    "defaultDistance": 3,
    "defaultZoomLevel": 15,
    "defaultToCenter": true,
    // **************************** //
    
    // **************************** //
    // ** CAMAYENNE CONFIG        ** //
    "camayenne": {
        "poiLayerUrl": "__TO_REPLACE__",
        "reportsLayerUrl": "__TO_REPLACE__",
        "routesLayerUrl": "",
        "poiLayerTitle": "Lieux",
        "reportsLayerTitle": "Signalements",
        "defaultCenter": null,
        "defaultZoom": 15,
        "lightMode": true,
        "lazyLayers": true,
        "poiCategories": [
            { "value": "PHARMACIE", "label": "Pharmacie", "symbol": "SANTE.png" },
            { "value": "HOPITAL", "label": "Hôpital", "symbol": "HOPITAL.png" },
            { "value": "ECOLE", "label": "École", "symbol": "EDUCATION.png" },
            { "value": "UNIVERSITE", "label": "Université", "symbol": "UNIVERSITE.png" },
            { "value": "MOSQUEE", "label": "Mosquée", "symbol": "PATRIMOINE.png" },
            { "value": "MARCHE", "label": "Marché", "symbol": "DIVERS.png" },
            { "value": "RESTAURANT", "label": "Restaurant", "symbol": "TOURISME.png" },
            { "value": "STATION_SERVICE", "label": "Station-service", "symbol": "TRANSPORT.png" },
            { "value": "BANQUE_ATM", "label": "Banque / ATM", "symbol": "SERVICE PUBLIC.png" },
            { "value": "HOTEL", "label": "Hôtel", "symbol": "OFFICE DE TOURISME.png" },
            { "value": "ADMINISTRATION", "label": "Administration", "symbol": "ADMINISTRATION.png" },
            { "value": "TRANSPORT", "label": "Transport", "symbol": "TRANSPORT.png" },
            { "value": "LOISIRS", "label": "Loisirs", "symbol": "SPORT ET LOISIR.png" },
            { "value": "AUTRES", "label": "Autres", "symbol": "DIVERS.png" }
        ],
        "reportTypes": [
            { "value": "VOIRIE", "label": "Voirie" },
            { "value": "ECLAIRAGE", "label": "Éclairage public" },
            { "value": "DECHETS", "label": "Déchets / Propreté" },
            { "value": "INONDATION", "label": "Inondation / Drainage" },
            { "value": "SECURITE", "label": "Sécurité" },
            { "value": "AUTRE", "label": "Autre" }
        ],
        "reportStatuses": [
            { "value": "NOUVEAU", "label": "Nouveau" },
            { "value": "EN_COURS", "label": "En cours" },
            { "value": "RESOLU", "label": "Résolu" }
        ],
        "fields": {
            "poi": {
                "name": "name",
                "category": "category",
                "address": "address",
                "phone": "phone",
                "description": "description",
                "status": "status",
                "createdAt": "created_at"
            },
            "reports": {
                "title": "title",
                "type": "type",
                "status": "status",
                "description": "description",
                "createdAt": "created_at"
            }
        }
    },
    // **************************** //
    
    // **************************** //
    // ** UTILITY PARAMETERS     ** //
    "routeUtility" : "",
    // **************************** //
    
    //This option demonstrates how to handle additional custom url parameters. For example
    //if you want users to be able to specify lat/lon coordinates that define the map's center or
    //specify an alternate basemap via a url parameter.
    "urlItems": [
        "extent",
        "color",
        "cycleColors",
        "showDirections",
        "defaultDistance"
    ],
    "helperServices": {
        "geometry": {
            "url": null
        },
        "printTask": {
            "url": null
        },
        "routeTask": {
           "url": null
        },
        "elevationSync": {
            "url": null
        },
        "geocode": [{
            "url": null
        }]
    },
    "layers":[
        {
            "url": "",
            "field": ""
        }
    ]
});
