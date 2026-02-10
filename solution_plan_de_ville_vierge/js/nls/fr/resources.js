/*global define */
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
define(
    ({
      "map" : {
         "error" : "Impossible de créer la carte"
      },
      "days" : {
         "now" : "MAINTENANT",
         "sun" : "DIM",
         "mon" : "LUN",
         "tue" : "MAR",
         "wed" : "MER",
         "thu" : "JEU",
         "fri" : "VEN",
         "sat" : "SAM"
      },
      "tooltips" : {
         "logo" : "Logo",
         "menu" : "Menu",
         "close" : "Fermer",
         "previous" : "Précédent",
         "next" : "Suivant",
         "directions" : "Feuille de route"
      },
      "camayenne": {
         "title": "Plan de quartier Camayenne",
         "tabs": {
            "search": "Rechercher",
            "add": "Ajouter",
            "report": "Signaler"
         },
         "sections": {
            "searchTitle": "Rechercher un lieu",
            "addTitle": "Ajouter un lieu",
            "reportTitle": "Signaler un problème"
         },
         "labels": {
            "name": "Nom",
            "category": "Catégorie",
            "address": "Adresse",
            "phone": "Téléphone",
            "description": "Description",
            "type": "Type",
            "status": "Statut",
            "title": "Titre",
            "filterType": "Filtrer (type)",
            "filterStatus": "Filtrer (statut)"
         },
         "placeholders": {
            "searchName": "Nom du lieu",
            "name": "Nom du lieu",
            "address": "Adresse ou repère",
            "phone": "+224 ...",
            "description": "Détails utiles",
            "reportTitle": "Ex: nid de poule",
            "reportDescription": "Détails du signalement"
         },
         "buttons": {
            "search": "Rechercher",
            "clear": "Effacer",
            "pick": "Choisir sur la carte",
            "useCenter": "Utiliser le centre",
            "submit": "Envoyer",
            "reset": "Réinitialiser"
         },
         "toggles": {
            "showPoi": "Afficher les POI sur la carte",
            "showReports": "Afficher les signalements sur la carte"
         },
         "misc": {
            "pointUnset": "Point: non défini",
            "pointPrefix": "Point:",
            "panelCollapse": "Réduire",
            "panelExpand": "Ouvrir",
            "poiLayerMissing": "POI layer non configurée.",
            "reportLayerMissing": "Signalements non configurés.",
            "pickOnMap": "Touchez la carte pour placer le point.",
            "pointSetCenter": "Point défini au centre de la carte.",
            "poiAdded": "Lieu ajouté. Merci.",
            "reportSent": "Signalement envoyé. Merci.",
            "sendError": "Erreur lors de l'envoi.",
            "searchError": "Erreur de recherche.",
            "noResults": "Aucun résultat."
         },
         "options": {
            "all": "Tous"
         },
         "categories": {
            "PHARMACIE": "Pharmacie",
            "HOPITAL": "Hôpital",
            "ECOLE": "École",
            "UNIVERSITE": "Université",
            "MOSQUEE": "Mosquée",
            "MARCHE": "Marché",
            "RESTAURANT": "Restaurant",
            "STATION_SERVICE": "Station-service",
            "BANQUE_ATM": "Banque / ATM",
            "HOTEL": "Hôtel",
            "ADMINISTRATION": "Administration",
            "TRANSPORT": "Transport",
            "LOISIRS": "Loisirs",
            "AUTRES": "Autres"
         },
         "reportTypes": {
            "VOIRIE": "Voirie",
            "ECLAIRAGE": "Éclairage public",
            "DECHETS": "Déchets / Propreté",
            "INONDATION": "Inondation / Drainage",
            "SECURITE": "Sécurité",
            "AUTRE": "Autre"
         },
         "reportStatuses": {
            "NOUVEAU": "Nouveau",
            "EN_COURS": "En cours",
            "RESOLU": "Résolu"
         }
      }
   })
);
