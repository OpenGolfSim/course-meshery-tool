import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Slider,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import MuiAccordionSummary, {
  accordionSummaryClasses,
} from '@mui/material/AccordionSummary';
import { styled } from '@mui/material/styles';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import SearchIcon from '@mui/icons-material/Search';
import ReloadIcon from '@mui/icons-material/Refresh';
import MagicIcon from '@mui/icons-material/AutoAwesome';
import SaveIcon from '@mui/icons-material/SaveAlt';
import SatelliteIcon from '@mui/icons-material/Satellite';
import ShapeLineIcon from '@mui/icons-material/ShapeLine';
import TonalityIcon from '@mui/icons-material/Tonality';
import ImageIcon from '@mui/icons-material/Image';
import CheckIcon from '@mui/icons-material/Check';
import ZoomIcon from '@mui/icons-material/ZoomIn';
import FocusIcon from '@mui/icons-material/CenterFocusStrong';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import DownloadIcon from '@mui/icons-material/Download';
import LocationIcon from '@mui/icons-material/MyLocation';
import ArrowForwardIosSharpIcon from '@mui/icons-material/ArrowForwardIosSharp';
// import proj4 from 'proj4';
// window.proj4 = proj4;
// import gsap from "gsap";
// // import PathEditor from "gsap/PathEditor";
// import MotionPathPlugin from "gsap/MotionPathPlugin";
// import MotionPathHelper from "gsap/MotionPathHelper";
// import { useGSAP } from "@gsap/react";
import * as turf from '@turf/turf';
// import osmtogeojson from 'osmtogeojson';
import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// import "@geoman-io/leaflet-geoman-free";
// import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import centerPoint from '../images/centerPoint.png';
import { useProject } from '../contexts/Project';
import GenerateSVGDialog from '../dialogs/GenerateSVGDialog';
import { Accordion, AccordionDetails, AccordionSummary } from '../components/Accordion';
import ViewLidarDialog from '../dialogs/ViewLidarDialog';
import NumberField from '../components/NumberField';
import SVGEditor from '../components/SVGEditor';
import CourseMapLayer from '../components/CourseMapLayer';
import GenerateSatelliteDialog from '../dialogs/GenerateSatelliteDialog';
import TerrainDownloadDialog from '../dialogs/TerrainDownloadDialog';

// gsap.registerPlugin(useGSAP, MotionPathPlugin);

// Delete the internal '_getIconUrl' so Leaflet doesn't try to guess
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});
var centerPointIcon = L.icon({
    iconUrl: centerPoint,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [-3, -76],
});

L.TileLayer.QuadKey = L.TileLayer.extend({
  getTileUrl: function (coords) {
    return L.Util.template(this._url, {
      s: this._getSubdomain(coords),
      q: this._quadKey(coords.x, coords.y, coords.z),
    });
  },

  _quadKey: function (x, y, z) {
    let quadKey = '';
    for (let i = z; i > 0; i--) {
      let digit = 0;
      const mask = 1 << (i - 1);
      if ((x & mask) !== 0) digit++;
      if ((y & mask) !== 0) digit += 2;
      quadKey += digit;
    }
    return quadKey;
  },
});

L.tileLayer.quadKey = function (url, options) {
  return new L.TileLayer.QuadKey(url, options);
};

const availableTileLayers = [
  {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
    key: 'OpenStreetMap',
    maxNativeZoom: 19,
    maxZoom: 22
  },
  {
    url: 'http://mt.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '© Google',
    key: 'Google Satellite',
    maxNativeZoom: 22,
    maxZoom: 22
  },
  {
    url: 'https://ecn.t{s}.tiles.virtualearth.net/tiles/a{q}.jpeg?g=1',
    quadKey: true,
    attribution: '© Microsoft',
    key: 'Bing Satellite',
    maxNativeZoom: 22,
    maxZoom: 22
  },
  {
    url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'ArcGIS',
    key: 'ArcGIS WorldImagery',
    maxNativeZoom: 19,
    maxZoom: 22
  },
];


const surfaceStyles = {
  tee: { color: '#0f8440' },
  hole: { color: '#cc432e' },
  pin: { color: '#ccbf2e' },
  green: { color: '#1ed19f' },
  bunker: { color: '#938253' },
  fairway: { color: '#38ff8b' },
  rough: { color: '#1c8749' },
  water_hazard: { color: '#3b2ecc' },
  lateral_water_hazard: { color: '#2e9acc' },
  driving_range: { color: '#539970' },
  clubhouse: { color: '#ea32ff' },
  cartpath: { color: '#232323', weight: 6 },
  path: { color: '#8d8d8d' },
};

function SidebarHeader({ children, ...rest }) {
  return (
    <Typography sx={{ flex: 1 }} component="span" variant="subtitle2" color="textSecondary" {...rest}>{children}</Typography>
  )
}


export default function Map() {
  const {
    // settings,
    // setSettings,
    project,
    setProjectSettings,
    lidarSources,
    searchOSMShapes,
    handleDownloadCourse,
    generateHillShade,
    generateSatellite,
    // lidarFile,
  } = useProject();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const drawnItems = useRef(new L.featureGroup());
  const outlineLayer = useRef();
  const hillshadeLayer = useRef();
  const satelliteLayer = useRef();
  const svgOverlayLayer = useRef();
  const svgContainer = useRef();
  const pathEditor = useRef();
  const [layerVisibility, setLayerVisibility] = useState({
    hillshade: true,
    satellite: false,
    svg: true
  });
  const [isEditingCenter, setIsEditingCenter] = useState(false);
  // const [mapState, setMapState] = useState({ setCenter: false });

  // const [courseLayers, setCourseLayers] = useState([
  //   // { id: 'path1', class: 'fairway', points: [[30, 30], [40, 30], [40, 45], [30, 45]], isClosed: true }
  // ]);

  const lidarLayer = useRef();
  const centerPointLayer = useRef();
  // const courseShapesLayer = useRef();
  const [panelExpanded, setPanelExpanded] = useState('course-area');
  const [shapesDialogOpen, setShapesDialogOpen] = useState(false);
  const [satelliteDialogOpen, setSatelliteDialogOpen] = useState(false);
  const [elevationDialogOpen, setElevationDialogOpen] = useState(false);
  const [lidarDialogData, setLidarDialogData] = useState(null);

  const [isLidarDownloading, setIsLidarDownloading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(15);

  const satelliteLayers = useMemo(() => {
    const vals = Object.values(project.satellite || {});
    if (!vals?.length) {
      return [{ source: 'none' }];
    }
    return vals;
  }, [project?.satellite]);

  const addSatelliteImageLayer = async (item) => {
    console.log('sat', outlineLayer.current, item);
    if (!item.uri) {
      return;
    }
    const bounds = outlineLayer.current.getBounds();
    const coords = [
      [bounds.getNorth(), bounds.getWest()],
      [bounds.getSouth(), bounds.getEast()]
    ];
    // const coords = {
    //   south: bounds.getSouth(),
    //   west: bounds.getWest(),
    //   north: bounds.getNorth(),
    //   east: bounds.getEast()
    // };
    console.log('bounds', bounds);
    satelliteLayer.current = L.imageOverlay(item.uri, coords, {
      opacity: 0.7, // Optional: Set transparency
      interactive: false // Optional: Enable click events
    });
    setLayerVisibility(old => ({ ...old, satellite: item.source }));

    // const response = await fetch(item.uri);
    // console.log('fetched', response.status);
    // const arrayBuffer = await response.arrayBuffer();
    // console.log('read data, parsing georaster...');
    // const georaster = await parseGeoraster(arrayBuffer);
    // console.log('Done parsing georaster...');

    // if (!satelliteLayer.current) {
    //   mapRef.current.createPane('satellite');
    //   mapRef.current.getPane('satellite').style.zIndex = 251; // above tilePane (200)
    // } else {
    //   mapRef.current.removeLayer(satelliteLayer.current);
    // }

    // satelliteLayer.current = new GeoRasterLayer({
    //   georaster,
    //   pane: 'satellite',
    //   opacity: 0.7,
    //   resolution: 128, // controls rendering quality vs performance
    //   updateWhenIdle: true,      // only re-render after zoom/pan finishes
    //   updateWhenZooming: false,  // skip intermediate frames
    // });

    satelliteLayer.current.addTo(mapRef.current);
  }

  const addHillShadeLayer = async (uri) => {
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const georaster = await parseGeoraster(arrayBuffer);

    if (!hillshadeLayer.current) {
      mapRef.current.createPane('hillshade');
      mapRef.current.getPane('hillshade').style.zIndex = 250; // above tilePane (200)
    } else {
      mapRef.current.removeLayer(hillshadeLayer.current);
    }
    hillshadeLayer.current = new GeoRasterLayer({
      georaster,
      pane: 'hillshade',
      opacity: 0.8,
      resolution: 256, // controls rendering quality vs performance
      updateWhenIdle: true,      // only re-render after zoom/pan finishes
      updateWhenZooming: false,  // skip intermediate frames

      // // Optional: custom pixel coloring
      pixelValuesToColorFn: values => {
        const value = values[0];
        if (value === georaster.noDataValue || value === null) return null;
        // Example: grayscale mapping
        const scaled = Math.round((value / 255) * 255);
        return `rgb(${scaled}, ${scaled}, ${scaled})`;
      }
    });

    hillshadeLayer.current.addTo(mapRef.current);
  }

  const handleShowHideSVG = useCallback(() => {
    setLayerVisibility(old => {
      const newVal = !old.svg;
      if (newVal && svgOverlayLayer.current) {
        svgOverlayLayer.current.addTo(mapRef.current);
      } else if (svgOverlayLayer.current) {
        mapRef.current.removeLayer(svgOverlayLayer.current);
      }
      return { ...old, svg: newVal };
    });
  }, []);

  const handleShowHideSatelliteLayer = useCallback((satelliteSource) => {
    setLayerVisibility(old => {
      if (!!old.satellite) {
        mapRef.current.removeLayer(satelliteLayer.current);
        return { ...old, satellite: null };
      }
      satelliteLayer.current.addTo(mapRef.current);
      return { ...old, satellite: satelliteSource };
    });
  }, []);

  const handleShowHideLayer = useCallback((layerId, layerRef) => {
    console.log('show=hide');
    setLayerVisibility(old => {
      const newVal = !old[layerId];
      if (newVal && layerRef.current) {
        layerRef.current.addTo(mapRef.current);
      } else if (layerRef.current) {
        mapRef.current.removeLayer(layerRef.current);
      }
      return { ...old, [layerId]: newVal };
    });
  }, []);

  const handleShowHideHillShade = useCallback(() => {
    console.log('hillshadeLayer.current', hillshadeLayer.current);
    setLayerVisibility(old => {
      const newVal = !old.hillshade;
      if (newVal && hillshadeLayer.current) {
        hillshadeLayer.current.addTo(mapRef.current);
      } else if (hillshadeLayer.current) {
        mapRef.current.removeLayer(hillshadeLayer.current);
      }
      return { ...old, hillshade: newVal };
    });
  }, []);

  const handleGenerateHillShade = async () => {
    const result = await generateHillShade();
    console.log('result', result);
    // if (result?.uri) {
    //   await addHillShadeLayer(result.uri);
    // }
    // mapRef.current.fitBounds(hillshadeLayer.current.getBounds());
  }

  const handleGenerateSatellite = async () => {
    setSatelliteDialogOpen(true);
    // const result = await generateSatellite();
    // console.log('result', result);
  }

  const handlePanelChange = (panel) => (event, newExpanded) => {
    setPanelExpanded(newExpanded ? panel : false);
  };

  const handleDistanceChanged = (newValue) => {
    console.log(`New distance:`, newValue);
    setProjectSettings({ distance: newValue });
  }
  
  const processLidar = async (lidarFeature) => {
    setLidarDialogData(lidarFeature);
    // const bounds = outlineLayer.current.getBounds();
    // const coords = {
    //   south: bounds.getSouth(),
    //   west: bounds.getWest(),
    //   north: bounds.getNorth(),
    //   east: bounds.getEast()
    // };
    // setIsLidarDownloading(true);
    // console.log('download', lidarFeature);
    // console.log('from', coords);
    // await handleDownloadCourse(lidarFeature, coords);
    // setIsLidarDownloading(false);
  }

  const handleShapesSave = () => {
    // courseShapesLayer.current.addData(shapesGeoJSON);
    setShapesDialogOpen(false);
  }

  // const searchShapes = async () => {
  //   // const bounds = mapRef.current.getBounds();
  //   const bounds = outlineLayer.current.getBounds();
  //   const coords = [
  //     bounds.getSouth(),
  //     bounds.getWest(),
  //     bounds.getNorth(),
  //     bounds.getEast()
  //   ];
  //   console.log('find shapes for', coords);
  //   await searchOSMShapes(coords);
  // }

  const turfPointToPolygon = (lng, lat, distance) => {
    const centerTurfPoint = turf.point([lng, lat]);
    const buffer = turf.buffer(centerTurfPoint, distance, { units: 'kilometers' });
    const bbox = turf.bbox(buffer);
    return turf.bboxPolygon(bbox);
  }
  
  const handleMapClick = useCallback((evt) => {
    if (isEditingCenter) {
      console.log('map clicked: ', isEditingCenter, evt.latlng);
      setIsEditingCenter(false);
      setCenterPoint(evt.latlng);
    }
  }, [isEditingCenter]);

  const handleZoomChange = (e) => {
    console.log('event', e);
    const newZoom = e.target.getZoom();
    // makePathEditable();
    setZoomLevel(newZoom);
  }

  const setCenterPoint = (latlng) => {
    if (centerPointLayer.current) {
      mapRef.current.removeLayer(centerPointLayer.current);
    }
    // const newLayer = L.marker([latlng.lat, latlng.lng]).bindPopup('This is Ruby Hill Park.');
    // newLayer.addTo(mapRef.current);
    // centerPointLayer.current = newLayer;

    // const { lat, lng } = centerPointLayer.current.getLatLng();
    const { lat, lng } = latlng;
    console.log('New Center POI:', { lat, lng });
    setProjectSettings({
      centerPoint: { lat, lng },
    });
  }

  const availableLidar = useMemo(() => {
    if (!project.settings.centerPoint?.lng || !project.settings.centerPoint?.lat) {
      return;
    }
    const bboxPolygon = turfPointToPolygon(project.settings.centerPoint.lng, project.settings.centerPoint.lat, project.settings.distance);
    const intersectingFeatures = lidarSources.features?.filter(feature => {
      // the following returns true ONLY if the lidar feature fully covers the bbox
      return turf.booleanContains(feature, bboxPolygon);  
      // the following returns true if we have any partial overlap
      // return turf.booleanIntersects(feature, bboxPolygon);
    });
    return turf.featureCollection(intersectingFeatures);
  }, [project.settings.centerPoint, lidarSources]);


  const updateOutlineBox = useCallback(() => {
    if (!outlineLayer.current || !project.settings.centerPoint?.lat || !project.settings.centerPoint?.lng) {
      return;
    }
    const bboxPolygon = turfPointToPolygon(project.settings.centerPoint.lng, project.settings.centerPoint.lat, project.settings.distance);

    outlineLayer.current.clearLayers();
    outlineLayer.current.addData(bboxPolygon);

    const bounds = outlineLayer.current.getBounds();

    setProjectSettings({
      bounds: {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast()        
      }
    });
    
    updateSVGLayer();

  }, [project.settings]);

  const updateSVGLayer = useCallback(() => {
    if (!project._svgBuffer) {
      return;
    }
    const bounds = outlineLayer.current.getBounds();
    const svgBounds = [
      [bounds.getSouth(), bounds.getWest()], // southwest
      [bounds.getNorth(), bounds.getEast()] // northeast
    ];
  
    // svgContainer.current = document.createElement('div');
    // const svgUrl = 'data:image/svg+xml;base64,' + btoa(project._svgBuffer);
    const parser = new DOMParser();
    const svgElement = parser.parseFromString(project._svgBuffer, 'image/svg+xml').documentElement;
    svgElement.querySelectorAll('image').forEach(image => {
      console.log('remove image', image);
      image.remove();
    });
    console.log('svgElement', svgElement);
    if (svgOverlayLayer.current) {
      mapRef.current.removeLayer(svgOverlayLayer.current);
    }
    svgOverlayLayer.current = L.svgOverlay(svgElement, svgBounds, { opacity: 0.75 }).addTo(mapRef.current);

  }, [project._svgBuffer]);

  const handleCenterClick = () => {
    // project.settings.centerPoint?.lat && handleZoomToCenter()
    setIsEditingCenter(old => !old);
    
  }

  const handleZoomToCenter = () => {
    // mapRef.current
    if (!project.settings.centerPoint?.lat){
      return;
    }
    const bounds = outlineLayer.current.getBounds();
    // mapRef.current.setView([latitude, longitude], zoomLevel);
    // Fit the map view to the bounds
    mapRef.current.fitBounds(bounds);
  }
  

  // useEffect(() => {
  //   console.log('settings.layers changed', settings.layers);
  // //   // set layers
  // //   courseShapesLayer.current.clearLayers();
  // //   courseShapesLayer.current.addData({
  // //     "type": "FeatureCollection",
  // //     "features": settings.layers
  // //   });
  // }, [settings.layers]);

  useEffect(() => {
    updateOutlineBox();
    // if (!outlineLayer.current) {
    //   console.log('no layers');
    //   return;
    // }
    // if (settings.centerPoint?.lat && settings.centerPoint?.lng) {
    //   console.log('center point change');
    //   updateOutlineBox();
    // }
  }, [project.settings.centerPoint, project.settings.distance]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }
    mapRef.current.getContainer().style.cursor = isEditingCenter ? 'crosshair' : ''; // Change map cursor
    mapRef.current.on('click', handleMapClick);
    return () => {
      mapRef.current.off('click', handleMapClick);
    }
  }, [isEditingCenter]);

  useEffect(() => {
    if (project.hillShade?.uri) {
      addHillShadeLayer(project.hillShade.uri);
    }
  }, [project.hillShade?.uri]);
  
  // useEffect(() => {
  //   const vals = Object.values(project.satellite || {});
  //   if (outlineLayer.current && vals.length) {
  //     console.log('add sat', vals[0]);
  //     addSatelliteImageLayer(vals[0]);
  //   }
  // }, [project.satellite]);

  useEffect(() => {
    console.log('create map...', project.settings);

    
    // Add a tile layer (e.g., OpenStreetMap)
    // const tileUrl = 'http://mt.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
    // const tileUrl = 'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    // const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const tileLayers = availableTileLayers.reduce((prev, tile) => {
      if (tile.quadKey) {
        const { quadKey, ...rest } = tile;
        return {
          ...prev,
          [tile.key]: L.tileLayer.quadKey(tile.url, {
            // maxNativeZoom: 19,
            // maxZoom: 22,
            subdomains: ['0', '1', '2', '3'],
            ...rest,
          }),
        }
      }
      return {
        ...prev,
        [tile.key]: L.tileLayer(tile.url, {
          maxNativeZoom: 19,
          maxZoom: 22,
          // pmIgnore: true,
          ...tile,
        }),
      }
    }, {});

    mapRef.current = L.map(containerRef.current, {
        center: project.settings.centerPoint?.lat ? [project.settings.centerPoint.lat, project.settings.centerPoint.lng] : [41.2165937, -97.872955],
        zoom: project.settings.centerPoint?.lat ? 15 : 5,
        minZoom: 5,
        maxZoom: 22,
        layers: [
          tileLayers[availableTileLayers[0].key]
        ]
    });
    mapRef.current.on('zoomend', handleZoomChange);

    L.control.layers(tileLayers).addTo(mapRef.current);

    drawnItems.current.addTo(mapRef.current);

    // const customSVGIcon = L.divIcon({
    //     className: 'custom-svg-icon', // Use a custom class for styling
    //     html: svgIconCode,
    //     iconSize: [24, 37],
    //     iconAnchor: [12, 37], // Position the tip of the icon on the coordinate
    //     popupAnchor: [0, -37] // Position the popup relative to the icon anchor
    // });

    // L.marker([51.5, -0.09], { icon: customSVGIcon }).addTo(map);

    // courseShapesLayer.current = L.geoJSON({
    //   type: "FeatureCollection",
    //   features: project.settings.layers || []
    // }, {
    //   style: (feature) => {
    //     return {
    //       color: '#cb41b0',
    //       fillOpacity: 0.5,
    //       weight: 2,
    //       ...surfaceStyles?.[feature.properties.golf] ? surfaceStyles[feature.properties.golf] : {},
    //     };
    //   }
    // }).addTo(mapRef.current);
    
    // bindCourseLayerPopup();
    
    outlineLayer.current = L.geoJSON(null, {
      snapIgnore: true,
      pmIgnore: true,
      style: {
        color: "#ff7800",
        weight: 5,
        fillColor: "#000",
        fillOpacity: 0,
        opacity: 0.65
      }
    }).addTo(mapRef.current);
    
    lidarLayer.current = L.geoJSON(null, {
      snapIgnore: true,
      pmIgnore: true,
      style: {
        color: "#ebd957",
        weight: 5,
        fillColor: "#ebd957",
        fillOpacity: 0.25,
        opacity: 0.65
      }
    }).addTo(mapRef.current);

    // var editInfo = L.control({
    //   position: 'topleft'
    // });
    // editInfo.onAdd = function (map) {
    //     this._div = L.DomUtil.create('div', 'info'); // create a div with class "info"
    //     this.update();
    //     return this._div;
    // };

    // editInfo.update = function (props) {
    //     this._div.innerHTML = '<h4>Map Information</h4>' +  (props ?
    //         '<b>' + props.name + '</b>' : 'Hover over a feature');
    // };
    // editInfo.addTo(mapRef.current);


    // L.Control.CustomTools = L.Control.extend({
    //   options: { position: 'topleft' },
    //   onAdd: (map) => {
        
    //     var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    //     // center button
    //     var button = L.DomUtil.create('a', 'leaflet-control-button', container);
    //     var icon = L.DomUtil.create('div', 'control-icon control-icon-poi', button);
    //     L.DomEvent.disableClickPropagation(button);
    //     let isEditing = false;
    //     L.DomEvent.on(button, 'click', () => {
    //       console.log('click');
          
    //       button.style.backgroundColor = '#ccc'; // Highlight button to show it's active
    //       map.getContainer().style.cursor = 'crosshair'; // Change map cursor
    //       isEditing = true;

    //       map.on('click', (evt) => {
    //         console.log('selected center point!', evt);
    //         // isEditing = !isEditing;
    //         if (isEditing) {
    //           setCenterPoint(evt.latlng);
    //           isEditing = false;
    //         }
    //       });
    //     });
    //     button.title = "Set course center position";
        
    //     // draw button
    //     var drawButton = L.DomUtil.create('a', 'leaflet-control-button', container);
    //     var drawIcon = L.DomUtil.create('div', 'control-icon control-icon-draw', drawButton);
    //     L.DomEvent.disableClickPropagation(drawButton);
    //     L.DomEvent.on(drawButton, 'click', () => {
    //         console.log('drawButton click');
    //     });
    //     drawButton.title = "Add new course shape";

    //     return container;
    //   },
    //   onRemove: (map) => {},
    // });

    // const controls = new L.Control.CustomTools();
    // controls.addTo(mapRef.current);

    // L.Control.CustomColors = L.Control.extend({
    //   options: { position: 'bottomleft' },
    //   onAdd: (map) => {
    //     var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    //     // center button
    //     var button = L.DomUtil.create('a', 'leaflet-control-button', container);
    //     var icon = L.DomUtil.create('div', 'control-icon control-icon-poi', button);
    //     L.DomEvent.disableClickPropagation(button);
    //     L.DomEvent.on(button, 'click', () => {
    //       console.log('click');
    //     });
    //     button.title = "Set course center position";
    //     return container;
    //   },
    //   onRemove: (map) => {},
    // });
    // const colors = new L.Control.CustomColors();
    // colors.addTo(mapRef.current);


    

    // if (project._svgBuffer) {
    //   console.log('render SVG', project._svgBuffer);
    //   updateSVGLayer();
    // }
 
    updateOutlineBox();

    return () => {
      console.log('clean up map...');
      // mapRef.current.off('zoomend', handleZoomChange);
      // if (mapInstance && mapInstance.remove) {
      //   mapInstance.off();
      //   mapInstance.remove();
      // }

    }

  }, []);

  return (
    <React.Fragment>
      <Box sx={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
        <Box sx={{ width: 220, flexGrow: 0, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <Accordion expanded={panelExpanded === 'course-area'} onChange={handlePanelChange('course-area')}>
            <AccordionSummary id="course-area-header">
              <SidebarHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">Course Area</SidebarHeader>
              {project.settings.centerPoint ? (<CheckIcon />) : null}
            </AccordionSummary>
            <AccordionDetails>
              <Stack sx={{ p: 2 }} spacing={4}>
                
                <Stack direction="row" alignItems="center">
                  <Box flex={1}>
                    {project.settings.centerPoint?.lat ? (
                      <Typography>{project.settings.centerPoint.lat.toFixed(4)}, {project.settings.centerPoint.lng.toFixed(4)}</Typography>
                    ) : (
                      <Typography color="textSecondary">Not Set</Typography>
                    )}
                  </Box>
                  <Tooltip title="Set Center">
                    <IconButton
                      disabled={project.lidar}
                      color={isEditingCenter ? 'primary' : 'inherit'}
                      onClick={handleCenterClick}
                    >
                      <FocusIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Zoom to Area">
                    <span>
                      <IconButton
                        disabled={!project.settings.centerPoint?.lat}
                        onClick={handleZoomToCenter}
                      >
                        <ZoomIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
                <NumberField
                  label="Course Size (km)"
                  min={0.2}
                  max={3}
                  step={0.05}
                  value={project.settings.distance}
                  size="small"
                  onChange={handleDistanceChanged}
                />

                {/* <Stack direction="row" alignItems="center" spacing={2}>
                  <Typography sx={{ flexShrink: 0 }}>{settings.distance} km</Typography>
                  <Slider />
                </Stack> */}
              </Stack>

            </AccordionDetails>
          </Accordion>

          <Accordion expanded={panelExpanded === 'elevation'} onChange={handlePanelChange('elevation')}>
            <AccordionSummary id="elevation-header">
              <SidebarHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">
                Terrain
              </SidebarHeader>
              {project.lidar ? (<CheckIcon />) : null}
            </AccordionSummary>
            <AccordionDetails>

                {project.lidar ? (
                  <Stack sx={{ p: 2 }} spacing={4}>
                    <Chip
                      onDelete={() => setElevationDialogOpen(true)}
                      deleteIcon={<SearchIcon />}
                      label={`${(project.lidar.points / 1_000_000).toFixed(1)}M POINTS`}
                    />
                    {/* <Typography>{(project.lidar.points / 1_000_000).toFixed(1)}M points</Typography> */}
                    {/* <Button fullWidth onClick={() => setElevationDialogOpen(true)}>View Elevation Data</Button> */}
                    <Grid container>
                      <Grid size={6}>Terrain Size</Grid>
                      <Grid size={6}>{(project.settings.distance * 1000).toFixed(0)}</Grid>
                      <Grid size={6}>Terrain Height</Grid>
                      <Grid size={6}>{project.lidar.stats.relief.toFixed(2)}</Grid>
                      <Grid size={6}>Min</Grid>
                      <Grid size={6}>{project.lidar.stats.min.toFixed(2)}</Grid>
                      <Grid size={6}>Max</Grid>
                      <Grid size={6}>{project.lidar.stats.max.toFixed(2)}</Grid>
                    </Grid>
                  </Stack>
                ) : (
                  <List disablePadding={true}>
                    {availableLidar?.features.length > 0 ? (
                      availableLidar?.features?.map(feature => {
                        return (
                          <Tooltip key={feature.properties.name} title={feature.properties.name}>
                            <ListItem
                              secondaryAction={
                                isLidarDownloading ? (
                                  <CircularProgress size={20} />
                                ) : (
                                  <IconButton onClick={() => processLidar(feature)}><DownloadIcon /></IconButton>
                                )
                              }
                              // secondaryAction={<Button onClick={() => processLidar(feature)}>Download Lidar</Button>}
                            >
                              <ListItemText
                                primary={feature.properties.name}
                                slotProps={{
                                  primary: {
                                    noWrap: true, // Applies text-overflow: ellipsis, overflow: hidden, and white-space: nowrap
                                    sx: { maxWidth: '100%', fontSize: 11 } // Ensure the typography component respects the parent's width
                                  }
                                }}
                              />
                            </ListItem>
                          </Tooltip>
                        );
                      })
                    ): (
                      project.settings.centerPoint ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', p: 2 }}>
                          <Typography component="div" variant="caption" color="textSecondary" sx={{ textAlign: 'center' }}>
                            {`No lidar exists for this course yet :(`}
                          </Typography>
                          <Button onClick={() => window.meshery.openExternalUrl('https://usgs.entwine.io/')}>
                            View available data
                          </Button>
                        </Box>
                      ) : (
                        <Box sx={{ textAlign: 'center', p: 2 }}>
                          <Typography color="textSecondary">Course center point must be set</Typography>
                        </Box>
                      )
                    )}
                  </List>
                )}
              

            </AccordionDetails>

          </Accordion>
          <Accordion expanded={panelExpanded === 'layers'} onChange={handlePanelChange('layers')}>
            <AccordionSummary id="layers-header">
              <SidebarHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">Course Layers</SidebarHeader>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <List disablePadding={true}>
                
                <CourseMapLayer
                  icon={<TonalityIcon color={layerVisibility.hillshade ? 'inherit' : 'secondary'} />}
                  endIcon={<CheckIcon color={!!project.hillShade ? 'success' : 'secondary'} />}
                  hidden={!layerVisibility.hillshade}
                  label={project?.hillShade?.fileName || 'Hillshade'}
                  menuItems={[
                    {
                      label: layerVisibility.hillshade ? 'Hide Layer' : 'Show Layer',
                      icon: layerVisibility.hillshade ? <Visibility /> : <VisibilityOff />,
                      onClick: () => handleShowHideLayer('hillshade', hillshadeLayer)
                    },
                    {
                      label: 'Generate Hillshade',
                      icon: <MagicIcon />,
                      disabled: !!project.hillShade,
                      onClick: handleGenerateHillShade
                    }
                  ]}
                />
                {/* <ListItem
                  // sx={{ p: 0, m: 0 }}
                  secondaryAction={project.svg ? (
                    <IconButton><VisibilityOff /></IconButton> 
                  ) : (
                    <Button disabled={!project.lidar} onClick={() => window.meshery.project.saveSVG()}>Generate</Button>
                  )}
                >
                  <ListItemIcon sx={{ minWidth: 30 }}>
                    <ShapeLineIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="SVG"
                    slotProps={{
                      primary: {
                        noWrap: true, // Applies text-overflow: ellipsis, overflow: hidden, and white-space: nowrap
                        sx: { maxWidth: '100%', fontSize: 11 } // Ensure the typography component respects the parent's width
                      }
                    }}
                  />
                </ListItem> */}
                {/* <ListItem
                  secondaryAction={project.hillShade ? (
                    <IconButton><Visibility /></IconButton> 
                  ) : (
                    <Button disabled={!project.lidar} onClick={handleGenerateHillShade}>Generate</Button>
                  )}
                >
                  <ListItemIcon sx={{ minWidth: 30 }}>
                    <TonalityIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Hillshade"
                    slotProps={{
                      primary: {
                        noWrap: true, // Applies text-overflow: ellipsis, overflow: hidden, and white-space: nowrap
                        sx: { maxWidth: '100%', fontSize: 11 } // Ensure the typography component respects the parent's width
                      }
                    }}
                  />
                </ListItem> */}

                {satelliteLayers.map(satellite => (
                  <CourseMapLayer
                    key={satellite.source}
                    icon={<SatelliteIcon />}
                    endIcon={<CheckIcon color={satellite.source !== 'none' ? 'success' : 'secondary'} />}
                    // hidden={layerVisibility.satellite !== satellite.source}
                    label={'Satellite'}
                    secondary={satellite.source}
                    menuItems={[
                      // satellite.source !== 'none' && {
                      //   label: layerVisibility.satellite === satellite.source ? 'Hide Layer' : 'Show Layer',
                      //   icon: layerVisibility.satellite === satellite.source ? <Visibility /> : <VisibilityOff />,
                      //   onClick: () => handleShowHideSatelliteLayer(satellite.source)
                      // },
                      {
                        label: 'Generate Satellite',
                        icon: <MagicIcon />,
                        disabled: satelliteLayers.length === 3,
                        onClick: handleGenerateSatellite
                      }
                    ].filter(Boolean)}
                  />
                ))}

                {/* {Object.values(project?.satellite || {})?.length ? (
                  Object.values(project?.satellite || {}).map(satellite => (
                    <ListItem key={satellite.source} secondaryAction={<IconButton><Visibility /></IconButton>}>
                      <ListItemIcon sx={{ minWidth: 30 }}>
                        <ImageIcon />
                      </ListItemIcon>
                      <ListItemText
                        primary={satellite.source}
                        slotProps={{
                          primary: {
                            noWrap: true, // Applies text-overflow: ellipsis, overflow: hidden, and white-space: nowrap
                            sx: { maxWidth: '100%', fontSize: 11 } // Ensure the typography component respects the parent's width
                          }
                        }}
                      />
                    </ListItem>
                  ))
                ) : (
                  <ListItem secondaryAction={<Button disabled={!project.lidar} onClick={handleGenerateSatellite}>Generate</Button>}>
                    <ListItemIcon sx={{ minWidth: 30 }}>
                      <ImageIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary="Satellite"
                      slotProps={{
                        primary: {
                          noWrap: true, // Applies text-overflow: ellipsis, overflow: hidden, and white-space: nowrap
                          sx: { maxWidth: '100%', fontSize: 11 } // Ensure the typography component respects the parent's width
                        }
                      }}
                    />
                  </ListItem>
                )} */}
                
                <CourseMapLayer
                  icon={<ShapeLineIcon color={layerVisibility.svg ? 'inherit' : 'secondary'} />}
                  endIcon={<CheckIcon color={!!project.svg ? 'success' : 'secondary'} />}
                  hidden={!layerVisibility.svg}
                  secondary={project.svg?.fileName ? 'SVG File' : ''}
                  label={project.svg?.fileName ? project.svg.fileName : 'SVG File'}
                  menuItems={
                    !project.svg?.fileName ? [
                      {
                        label: 'Generate SVG',
                        icon: <MagicIcon />,
                        onClick: () => setShapesDialogOpen(true)
                      },
                      {
                        label: 'Import SVG',
                        icon: <FileOpenIcon />
                      },
                    ] :
                    [
                      {
                        label: layerVisibility.svg ? 'Hide Layer' : 'Show Layer',
                        icon: layerVisibility.svg ? <Visibility /> : <VisibilityOff />,
                        onClick: () => handleShowHideLayer('svg', svgOverlayLayer)
                      },
                      // {
                      //   label: 'Show / Hide',
                      //   disabled: !project.svg,
                      //   icon: <Visibility />
                      // },
                      {
                        label: 'Reload from disk',
                        disabled: !project.svg,
                        icon: <ReloadIcon />,
                        onClick: () => window.meshery.svg.refresh()
                      },
                      // {
                      //   label: 'Export SVG',
                      //   icon: <SaveIcon />,
                      //   disabled: !project.svg,
                      //   onClick: () => window.meshery.project.saveSVG()
                      // },
                    ]
                  }
                />                
              </List>
              {/* <Box sx={{ p: 2 }}>


                <Button
                  fullWidth
                  onClick={() => setShapesDialogOpen(true)}
                >
                  Search Shapes
                </Button>
              </Box> */}
              {/* <Box>
                <IconButton onClick={() => setShapesDialogOpen(true)}>
                  <ManageSearchIcon />
                </IconButton>
              </Box>
              <List disablePadding={true}>
                <ListItem
                  secondaryAction={<IconButton><FocusIcon /></IconButton>}
                >
                  <ListItemIcon sx={{ minWidth: 30 }}>
                    <ShapeLineIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="SVG File"
                    slotProps={{
                      primary: {
                        noWrap: true, // Applies text-overflow: ellipsis, overflow: hidden, and white-space: nowrap
                        sx: { maxWidth: '100%', fontSize: 11 } // Ensure the typography component respects the parent's width
                      }
                    }}
                  />
                </ListItem>
                <ListItem
                  secondaryAction={<IconButton><FocusIcon /></IconButton>}
                >
                  <ListItemIcon sx={{ minWidth: 30 }}>
                    <SatelliteIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Google Imagery"
                    slotProps={{
                      primary: {
                        noWrap: true, // Applies text-overflow: ellipsis, overflow: hidden, and white-space: nowrap
                        sx: { maxWidth: '100%', fontSize: 11 } // Ensure the typography component respects the parent's width
                      }
                    }}
                  />
                </ListItem>
              </List> */}
              
              {/* <Button>Add Shape</Button> */}
            </AccordionDetails>
          </Accordion>


        </Box>
        <div style={{ backgroundColor: '#aaa', width: '100%', height: '100%' }} id="map" ref={containerRef}></div>
        {/* This seems to get moved to the map when we add the svgOverlay */}
      </Box>

      <GenerateSatelliteDialog open={satelliteDialogOpen} onClose={() => setSatelliteDialogOpen(false)} />
      <GenerateSVGDialog open={shapesDialogOpen} onSave={handleShapesSave} onClose={() => setShapesDialogOpen(false)} />
      <TerrainDownloadDialog
        open={!!lidarDialogData}
        data={lidarDialogData}
        layerRef={outlineLayer}
        onClose={() => setLidarDialogData(null)}
      />
      <ViewLidarDialog open={elevationDialogOpen} onClose={() => setElevationDialogOpen(false)} />
    </React.Fragment>
  );
}
