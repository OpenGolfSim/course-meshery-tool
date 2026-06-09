import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemAvatar,
  ListItemIcon,
  ListItemText,
  ListSubheader,
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
import AddIcon from '@mui/icons-material/Add';
import InfoIcon from '@mui/icons-material/Info';
import SportsGolfIcon from '@mui/icons-material/SportsGolf';
import AimIcon from '@mui/icons-material/FilterTiltShift';
import FlagIcon from '@mui/icons-material/Flag';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
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
import * as turf from '@turf/turf';
// import osmtogeojson from 'osmtogeojson';
import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// import "@geoman-io/leaflet-geoman-free";
// import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import centerPoint from '../images/centerPoint.png';
import teeIconUrl from '../images/tee.png';
import aimIconUrl from '../images/aim.png';
import pinIconUrl from '../images/pin.png';
import { useProject } from '../contexts/Project';
import GenerateSVGDialog from '../dialogs/GenerateSVGDialog';
import { Accordion, AccordionDetails, AccordionHeader, AccordionSummary, SidebarAccordionGroup } from '../components/Accordion';
import NumberField from '../components/NumberField';
import SVGEditor from '../components/SVGEditor';
import CustomListItem from '../components/CustomListItem';
import GenerateSatelliteDialog from '../dialogs/GenerateSatelliteDialog';
import TerrainDownloadDialog from '../dialogs/TerrainDownloadDialog';
import TreeLayerDialog from '../dialogs/TreeLayerDialog';
import EditTerrainDialog from '../dialogs/EditTerrainDialog';
import ElevationStats from '../components/ElevationStats';
import ElevationDataDownload, { ElevationDataDownloadHeader } from '../components/ElevationDataDownload';
import { holeDataToGeoJSON } from '../utils/geojson';
import HolesList from '../components/HolesList';


const LOCAL_STORAGE_BASE_LAYER = 'ogs-map-base';
const MIN_LABEL_ZOOM = 17;

const worldBounds = [
  [-180, -90],
  [180, -90],
  [180, 90],
  [-180, 90],
  [-180, -90]
];

// Delete the internal '_getIconUrl' so Leaflet doesn't try to guess
delete L.Icon.Default.prototype._getIconUrl;

var centerPointIcon = L.icon({
    iconUrl: centerPoint,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [-3, -76],
});


const teeIcon = (text, color = '#de3f3f') => {
  const svg = `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<circle cx="50" cy="50" r="50" fill="${color}" />
<text x="50" y="50" style="font-size: 55px; font-weight: bold; font-family: monospace;" dominant-baseline="central" text-anchor="middle" fill="#FFFFFF">${text}</text>
</svg>`.replace('\n', '');
  return L.icon({
      // iconUrl: teeIconUrl,
      iconUrl: 'data:image/svg+xml;base64,' + btoa(svg),
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      // popupAnchor: [-3, -76],
  });
}
// var teeIcon = L.icon({
//     iconUrl: teeIconUrl,
//     iconSize: [20, 20],
//     iconAnchor: [10, 10],
//     popupAnchor: [-3, -76],
// });

var aimIcon = L.icon({
    iconUrl: aimIconUrl,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    // popupAnchor: [-3, -76],
});
var pinIcon = L.icon({
    iconUrl: pinIconUrl,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    // popupAnchor: [-3, -76],
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
    maxNativeZoom: 20,
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
    addHole,
    editHole,
    removeHole,
    addTree,
    removeTree,
    updateTree
    // lidarFile,
  } = useProject();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const drawnItems = useRef(new L.featureGroup());
  const outlineLayer = useRef();
  const courseDetailsLayer = useRef();
  // Create a ref for the distance labels group
  const distanceLabelsGroup = useRef(L.layerGroup());
  const hillshadeLayer = useRef();
  const satelliteLayer = useRef();
  const svgOverlayLayer = useRef();
  const svgContainer = useRef();

  const [isPending, setIsPending] = useState(null);
  const [layerVisibility, setLayerVisibility] = useState({
    hillshade: false,
    satellite: false,
    svg: true
  });
  const [isEditingCenter, setIsEditingCenter] = useState(false);
  const [isEditingHolePoint, setIsEditingHolePoint] = useState(null);
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
  const [terrainEditDialogOpen, setTerrainEditDialogOpen] = useState(false);
  const [lidarDialogData, setLidarDialogData] = useState(null);
  
  const [isLidarDownloading, setIsLidarDownloading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(15);
  
  const [treeEditDialog, setTreeEditDialog] = useState(null);
  const [treeLayers, setTreeLayers] = useState([]);
  // const [holes, setHoles] = useState([]);

  const holeData = useMemo(() => {
    return Array.from(project?.holes?.values()).filter(Boolean).sort((a,b) => a.number < b.number ? -1 : 1) || [];
  }, [project?.holes]);

  const satelliteLayers = useMemo(() => {
    const vals = Object.values(project.satellite || {});
    if (!vals?.length) {
      return [{ source: 'none' }];
    }
    return vals;
  }, [project?.satellite]);

  const getCoords = (bounds) => {
    // const bounds = outlineLayer.current.getBounds();
    const { west, south, east, north } = bounds;
    return [
      [north, west],
      [south, east]
      // [bounds.getNorth(), bounds.getWest()],
      // [bounds.getSouth(), bounds.getEast()]
    ];    
  };

  // const addSatelliteImageLayer = useCallback(async (item) => {
  //   if (!item.uri) {
  //     return;
  //   }
  //   satelliteLayer.current = L.imageOverlay(item.uri, getCoords(project.settings.bounds), {
  //     opacity: 0.7, // Optional: Set transparency
  //     interactive: false // Optional: Enable click events
  //   });
  //   setLayerVisibility(old => ({ ...old, satellite: item.source }));

  //   satelliteLayer.current.addTo(mapRef.current);
  // }, [project.settings.bounds]);

  const addHillShadeLayer = useCallback(async (uri) => {
    if (!uri) {
      return;
    }
    if (!hillshadeLayer.current) {
      mapRef.current.createPane('hillshade');
      mapRef.current.getPane('hillshade').style.zIndex = 250; // above tilePane (200)
    } else {
      mapRef.current.removeLayer(hillshadeLayer.current);
    }
    console.log(`HILLSHADE: ${uri}`);
    if (uri?.endsWith('.jpg')) {
      // const bboxPolygon = turf.bboxPolygon([west, south, east, north]);

      hillshadeLayer.current = L.imageOverlay(uri, getCoords(project.settings.bounds), {
        pane: 'hillshade',
        opacity: 0.7, // Optional: Set transparency
        interactive: false // Optional: Enable click events
      });
    } else if (uri?.endsWith('.tiff')) {
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const georaster = await parseGeoraster(arrayBuffer);
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
    }

    if (layerVisibility.hillshade) {
      hillshadeLayer.current.addTo(mapRef.current);
    }
  }, [layerVisibility.hillshade, project.settings.bounds]);

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

  const handleGenerateSVG = async () => {
    setIsPending('svg');
    setShapesDialogOpen(true);
    setIsPending(null);
  }

  const handleGenerateHillShade = async () => {
    setIsPending('hill');
    const result = await generateHillShade();
    setIsPending(null);
    console.log('result', result);
  }

  const handleGenerateSatellite = async () => {
    setIsPending('sat');
    setSatelliteDialogOpen(true);
  }

  const handleSatelliteClosed = () => {
    setSatelliteDialogOpen(false);
    setIsPending(null);
  }  

  const handlePanelChange = (panel) => (event, newExpanded) => {
    setPanelExpanded(newExpanded ? panel : false);
  };

  const handleDistanceChanged = useCallback((newValue) => {
    console.log(`New distance:`, newValue);
    let update = { distance: newValue };
    if (project.settings.centerPoint) {
      const [west, south, east, north] = turfPointToBBox(project.settings.centerPoint.lng, project.settings.centerPoint.lat, newValue);
      update.bounds = { west, south, east, north };
    }
    setProjectSettings(update);
  }, [project.settings.centerPoint]);

  const processLidar = async (lidarFeature) => {
    setLidarDialogData(lidarFeature);
  }

  const handleShapesSave = () => {
    // courseShapesLayer.current.addData(shapesGeoJSON);
    setShapesDialogOpen(false);
  }

  const turfPointToBBox = (lng, lat, distance) => {
    const centerTurfPoint = turf.point([lng, lat]);
    const buffer = turf.buffer(centerTurfPoint, (distance / 2), { units: 'kilometers' });
    return turf.bbox(buffer);
  }
  const turfPointToPolygon = (lng, lat, distance) => {
    const bbox = turfPointToBBox(lng, lat, distance);
    return turf.bboxPolygon(bbox);
  }
  
  const latLngToLocalXY = useCallback((clickLatLng) => {
    const { centerPoint, distance } = project.settings;
    const sizeMeters = distance * 1000;
    const halfMeters = sizeMeters / 2;
    const clickLng = clickLatLng.lng;
    const clickLat = clickLatLng.lat;
    // X axis: horizontal distance in meters (east = positive)
    const xDist = turf.distance(
      turf.point([centerPoint.lng, centerPoint.lat]),
      turf.point([clickLng, centerPoint.lat]), // same lat, different lng
      { units: 'meters' }
    );
    // const x = clickLng >= centerPoint.lng ? xDist : -xDist;
    const x = clickLng >= centerPoint.lng ? xDist : -xDist;

    // Y axis: vertical distance in meters (north = positive)
    const yDist = turf.distance(
      turf.point([centerPoint.lng, centerPoint.lat]),
      turf.point([centerPoint.lng, clickLat]), // same lng, different lat
      { units: 'meters' }
    );
    const y = clickLat >= centerPoint.lat ? yDist : -yDist;

    // Clamp to box bounds
    return {
      x: Math.max(0, Math.min(sizeMeters, x + halfMeters)),
      y: Math.max(0, Math.min(sizeMeters, -y + halfMeters))
      // x: Math.max(-halfMeters, Math.min(halfMeters, x)),
      // y: Math.max(-halfMeters, Math.min(halfMeters, y))
    };
  }, [project.settings.centerPoint]);
  
  const handleMapClick = useCallback((evt) => {
    if (isEditingCenter) {
      console.log('map clicked: ', isEditingCenter, evt.latlng);
      setIsEditingCenter(false);
      setCenterPoint(evt.latlng);
      return;
    }
    if (isEditingHolePoint) {
      const position = latLngToLocalXY(evt.latlng);
      editHole(isEditingHolePoint.hole, {
        [isEditingHolePoint.waypoint]: { latlng: L.GeoJSON.latLngToCoords(evt.latlng), position }
      });
      // e.layer.getElement().classList.toggle('hole-marker-edit');      
      setIsEditingHolePoint(null);
      console.log('clicked in hole edit mode: ', isEditingHolePoint, evt.latlng, position);
    }
  }, [isEditingCenter, isEditingHolePoint]);

  const handleLayerChange = (event) => {
    console.log("Base layer changed to: " + event.name);
    window.localStorage.setItem(LOCAL_STORAGE_BASE_LAYER, event.name);
  }

  const handleZoomChange = (e) => {
    const newZoom = e.target.getZoom();
    setZoomLevel(newZoom);
  }
  const handleOpenTerrainEdit = () => {
    setTerrainEditDialogOpen(true);
  }
  const setCenterPoint = useCallback((latlng) => {
    if (centerPointLayer.current) {
      mapRef.current.removeLayer(centerPointLayer.current);
    }
    // const newLayer = L.marker([latlng.lat, latlng.lng]).bindPopup('This is Ruby Hill Park.');
    // newLayer.addTo(mapRef.current);
    // centerPointLayer.current = newLayer;

    // const { lat, lng } = centerPointLayer.current.getLatLng();
    const { lat, lng } = latlng;
    const centerPoint = { lat, lng };
    console.log('New Center POI:', centerPoint);
    const [west, south, east, north] = turfPointToBBox(centerPoint.lng, centerPoint.lat, project.settings.distance);
    setProjectSettings({
      centerPoint: { lat, lng },
      bounds: { west, south, east, north }
    });
  }, [project.settings.centerPoint, project.settings.distance]);

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
    if (!outlineLayer.current || !project?.settings?.bounds) {
      return;
    }
    // if (!outlineLayer.current || !project.settings.centerPoint?.lat || !project.settings.centerPoint?.lng) {
    //   return;
    // }
    // const bboxPolygon = turfPointToPolygon(project.settings.centerPoint.lng, project.settings.centerPoint.lat, project.settings.distance);
    const { west, south, east, north } = project.settings.bounds;
    const bboxPolygon = turf.bboxPolygon([west, south, east, north]);
    // console.log('bboxPolygon', project.settings);
    
    const coords = [
      [north, west],
      [south, east]
    ];
    const outlineMask = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [worldBounds, bboxPolygon.geometry.coordinates[0]] // second ring = hole
      }
    };
    outlineLayer.current.clearLayers();
    outlineLayer.current.addData(outlineMask);


    // const bounds = outlineLayer.current.getBounds();
    // setProjectSettings({
    //   bounds: {
    //     south: bounds.getSouth(),
    //     west: bounds.getWest(),
    //     north: bounds.getNorth(),
    //     east: bounds.getEast()        
    //   }
    // });
    
    updateSVGLayer();
    
    // MOVE TO HELPER FN
    courseDetailsLayer.current.clearLayers();
    if (holeData.length) {
      console.log('holes', holeData);
      courseDetailsLayer.current.addData(holeDataToGeoJSON(holeData));
    }


  }, [project.settings]);

  const updateSVGLayer = useCallback(() => {
    if (!project._svgBuffer) {
      return;
    }
    const { south, west, north, east } = project.settings.bounds;
    // const bounds = outlineLayer.current.getBounds();
    const svgBounds = [
      [south, west], // southwest
      [north, east] // northeast
    ];
  
    const parser = new DOMParser();
    const svgElement = parser.parseFromString(project._svgBuffer, 'image/svg+xml').documentElement;
    svgElement.querySelectorAll('image').forEach(image => image.remove());

    if (!svgOverlayLayer.current) {
      mapRef.current.createPane('svg');
      mapRef.current.getPane('svg').style.zIndex = 251; // above hillshade (250)
    } else {
      mapRef.current.removeLayer(svgOverlayLayer.current);
    }

    svgOverlayLayer.current = L.svgOverlay(svgElement, svgBounds, { pane: 'svg', opacity: 0.75 }).addTo(mapRef.current);

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
    // const bounds = outlineLayer.current.getBounds();
    const { south, west, north, east } = project.settings.bounds;
    // mapRef.current.setView([latitude, longitude], zoomLevel);
    // Fit the map view to the bounds
    mapRef.current.fitBounds([[north, west], [south, east]]);
  }
  
  const handleTreeEdit = (tree) => {
    setTreeEditDialog(tree);
  }
  const handleTreeSave = (tree) => {
    updateTree(tree);
    setTreeEditDialog(null);
  }
  const handleTreeRemove = (tree) => {
    console.log('remove', tree);
    removeTree(tree);
  }
  const handleTreeAdd = useCallback(() => {
    addTree({
      id: `tree-${Date.now().toString(16)}${(Math.round(Math.random() * 1e5)).toString(16)}`,
      name: `Tree Layer ${project.trees.length + 1}`,
      positions: []
    });
    // setTreeLayers(old => ([ ...old, { imageData: null }]));
  }, [project.trees]);


  const updateCourseLabelVisibility = useCallback(() => {
    if (zoomLevel >= MIN_LABEL_ZOOM && distanceLabelsGroup.current) {
      distanceLabelsGroup.current.addTo(mapRef.current);
    } else if (distanceLabelsGroup.current) {
      distanceLabelsGroup.current.remove();
    }
    // courseDetailsLayer.current?.getLayers().forEach(layer => {
    //   const tooltip = layer.getTooltip();
    //   if (!tooltip) return;
    //   if (zoomLevel >= MIN_LABEL_ZOOM) {
    //     layer.openTooltip();
    //   } else {
    //     layer.closeTooltip();
    //   }
    // });
  }, [zoomLevel]);

  const handleWaypointDragEnd = (e) => {

    e.target.dragging.disable();
    e.target.off('dragend', handleWaypointDragEnd);

    const latlng = e.target.getLatLng();
    // const position = latLngToLocalXY(latlng);
    const { number, waypoint } = e.target?.feature?.properties;
    if (number && waypoint) {
      const update = {
        [waypoint]: { latlng: L.GeoJSON.latLngToCoords(latlng), position: latLngToLocalXY(latlng) }
      };
      editHole(number, update);
    }
    setIsEditingHolePoint(null);
  }
  const handleWaypointClick = (e) => {
    console.log(e);
  }
  const handleWaypointEdit = (e) => {
    console.log(`handleWaypointEdit`, e);
    if (e.layer) {
    //   e.layer.dragging.enable();
    //   e.layer.on('dragend', handleWaypointDragEnd);
      e.layer.closePopup();
    }
    const { number, waypoint } = e?.feature?.properties || {};
    if (number && waypoint) {
      setIsEditingHolePoint({ hole: number, waypoint });
    }
    // if (!e?.feature) { return; }
    // const { feature } = e;
    // setIsEditingHolePoint({ hole, key });
    // console.log('edit-waypoint clicked!', feature);
  }
  const clearHolePoint = ({ hole, waypoint }) => {
    editHole(hole, { [waypoint]: null });    
  }
  const handleRemoveHole = async (hole) => {
    const res = await window.meshery.dialog.confirm({ message: 'Are you sure you want to remove this hole?' });
    console.log('remove', res, hole);
    if (res) {
      removeHole(hole.number);
    }
  }
  const handleZoomToHole = (hole) => {
    console.log('removhandleZoomToHolee', hole);
    const points = [hole.tee?.latlng, hole.aim?.latlng, hole.pin?.latlng]
      .filter(Boolean)
      .map(point => L.latLng(point[1], point[0]))

    console.log('removhandleZoomToHolee', points);
    // mapRef.current.fitBounds(points);
    if (points?.length) {
      mapRef.current.fitBounds(points);
      // var latlng = L.latLng(hole.tee.latlng[1], hole.tee.latlng[0]);
      // mapRef.current.setView(latlng, 14);
    }
  }

  useEffect(() => {
    if (!courseDetailsLayer.current) {
      return;
    }
    const layers = courseDetailsLayer.current.getLayers();
    layers.forEach(layer => {
      if (!layer.feature?.properties?.number) {
        return;
      }
      const isActive = (
        layer.feature?.properties?.number === isEditingHolePoint?.hole &&
        layer.feature?.properties?.waypoint === isEditingHolePoint?.waypoint
      );
      if (isActive) {
        layer.dragging.enable();
      } else {
        layer.dragging.disable();
      }
      layer.getElement()?.classList.toggle('hole-marker-edit', isActive);
    });    
    // if (isEditingHolePoint) {
    //   const featureLayer = layers.find(layer => layer.feature?.properties?.number === isEditingHolePoint.hole);
    //   if (featureLayer) {
    //     featureLayer.getElement().classList.toggle('hole-marker-edit');
    //   }
    //   console.log('edit chagne! layers', layers);
    //   // e.layer.getElement().classList.toggle('hole-marker-edit');
    // } else {
      
    // }
  }, [isEditingHolePoint]);

  const handleWaypointRemove = (e) => {
    if (!e?.feature) { return; }
    const { number, waypoint } = e.feature.properties;
    console.log(`remove-waypoint ${number} - ${waypoint}`);
    editHole(number, { [waypoint]: null });    
  }

  useEffect(() => {
    if (!outlineLayer?.current) {
      return;
    }
    console.log('updateOutlineBox-useEffect');
    updateOutlineBox();
  }, [project.settings.centerPoint, project.settings.distance, project.holes]);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }
    mapRef.current.getContainer().style.cursor = (isEditingCenter || isEditingHolePoint) ? 'crosshair' : ''; // Change map cursor
    mapRef.current.on('click', handleMapClick);
    return () => {
      mapRef.current.off('click', handleMapClick);
    }
  }, [isEditingCenter, isEditingHolePoint]);

  useEffect(() => {
    if (!mapRef.current || !project.hillShade?.uri) {
      return;
    }
    addHillShadeLayer(project.hillShade.uri);
  }, [mapRef.current, project.hillShade?.uri]);

  // useEffect(() => {
  //   if (!mapRef.current || !Object.keys(project?.satellite | {}).length) {
  //     return;
  //   }
  //   console.log('add sat image', project.satellite[0]);
  //   addSatelliteImageLayer(project.satellite[0]);
  // }, [mapRef.current, project.satellite]);

  

  useEffect(() => {
    updateCourseLabelVisibility();
  }, [zoomLevel, courseDetailsLayer.current]);

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

    const stored = window.localStorage.getItem(LOCAL_STORAGE_BASE_LAYER);
    let initialLayer = availableTileLayers[0].key;
    if (stored) {
      const savedLayer = availableTileLayers.find(tl => tl.key === stored);
      if (savedLayer?.key) {
        initialLayer = savedLayer.key;
      }
    }

    mapRef.current = L.map(containerRef.current, {
        center: project.settings.centerPoint?.lat ? [project.settings.centerPoint.lat, project.settings.centerPoint.lng] : [41.2165937, -97.872955],
        zoom: project.settings.centerPoint?.lat ? 15 : 5,
        minZoom: 3,
        maxZoom: 22,
        layers: [
          tileLayers[initialLayer]
        ]
    });
    
    mapRef.current.on('zoomend', handleZoomChange);
    mapRef.current.on('baselayerchange', handleLayerChange)

    L.control.layers(tileLayers).addTo(mapRef.current);

    drawnItems.current.addTo(mapRef.current);

    
    outlineLayer.current = L.geoJSON(null, {
      snapIgnore: true,
      // pmIgnore: true,
      interactive: false,
      style: {
        color: "#000",
        weight: 3,
        fillColor: "#303030",
        fillOpacity: 0.7,
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

    
    mapRef.current.createPane('courseDetails');
    mapRef.current.getPane('courseDetails').style.zIndex = 300; // Lower than standard overlayPane (400)
    
    // Add it to the map once
    distanceLabelsGroup.current.addTo(mapRef.current);

    console.log('create details layer');
    courseDetailsLayer.current = L.geoJSON(null, {
      snapIgnore: true,
      pmIgnore: true,
      pane: 'courseDetails',
      style: {
        color: "#ffffff",
        weight: 3,
        fillColor: "#ebd957",
        fillOpacity: 0.25,
        opacity: 0.65
      },
      onEachFeature: (feature, layer) => {
        if (feature.geometry.type === 'LineString' && feature.geometry.coordinates.length >= 2) {
          const labelMarkers = [];
          layer.on('add', () => {
            // create labels and store references
            const coords = feature.geometry.coordinates;
            for (let i = 0; i < coords.length - 1; i++) {
              const from = turf.point(coords[i]);
              const to = turf.point(coords[i + 1]);

              const dist = turf.distance(from, to, { units: 'yards' });
              const mid = turf.midpoint(from, to);
              const [lng, lat] = mid.geometry.coordinates;
              const bearing = turf.bearing(from, to);

              let angle = bearing - 90;
              if (angle < -90) angle += 180;
              if (angle > 90) angle -= 180;

              const icon = L.divIcon({
                className: 'distance-label',
                html: `<span style="transform: translateY(-50%) rotate(${angle}deg)">${Math.round(dist)} yd</span>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
              });

              const marker = L.marker([lat, lng], { icon, interactive: false }).addTo(distanceLabelsGroup.current);
              labelMarkers.push(marker);
            }
          });
          layer.on('remove', () => {
            // remove labels
            // layer.off('click', handleLayerClick);
            labelMarkers.forEach(m => m.remove());
            labelMarkers.length = 0;
          });
        } else if (feature.geometry.type === 'Point') {
          // layer.bindTooltip(feature.properties.name, {
          //     permanent: true,
          //     direction: 'right',
          //     className: 'course-label'
          // });

          const container = document.createElement('div');
          container.className = 'hole-edit-content';
          
          const header = document.createElement('div');
          header.className = 'hole-edit-header';
          header.textContent = `Hole ${feature.properties.number} ${feature.properties.waypoint}`;

          const buttonContainer = document.createElement('div');
          buttonContainer.className = 'hole-buttons';

          const remButton = document.createElement('button');
          remButton.addEventListener('click', (e) => handleWaypointRemove({ originalEvent: e, feature, layer }));
          remButton.textContent = 'Remove';
          
          const editButton = document.createElement('button');
          editButton.addEventListener('click', (e) => handleWaypointEdit({ originalEvent: e, feature, layer }));
          editButton.textContent = 'Edit';

          buttonContainer.append(remButton, editButton);
          
          container.append(header, buttonContainer);

          layer.on('dragend', handleWaypointDragEnd);
          layer.bindPopup(container, {
            // direction: 'right',
            minWidth: 160,
            className: 'hole-edit-popup'
          });
          layer.on('click', handleWaypointClick);
        }
      },
      pointToLayer: (feature, latlng) => {
        if (feature.properties.waypoint === 'tee') {
          // console.log('feature.properties', feature.properties);
          return L.marker(latlng, {
            icon: teeIcon(feature.properties.number),
            // draggable: true,
            style: { fillColor: '#00FF00' }
          });
        } else if (feature.properties.waypoint === 'pin') {
          return L.marker(latlng, { icon: pinIcon });
        } else if (feature.properties.waypoint === 'aim') {
          return L.marker(latlng, { icon: aimIcon });
        }
        return L.circleMarker(latlng, {
            radius: 4,
            fillColor: "#ff7800",
            color: "#000",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.9
        });
      }      
    }).addTo(mapRef.current);
    
    updateOutlineBox();
    updateCourseLabelVisibility();

    return () => {
      console.log('clean up map...');
      // mapRef.current.off('zoomend', handleZoomChange);
      // if (mapInstance && mapInstance.remove) {
      //   mapInstance.off();
      //   mapInstance.remove();
      // }

    }

  }, []);

  const handleKeyboard = useCallback((e) => {
    console.log('e.code', e.code, isEditingHolePoint);
    if (isEditingHolePoint && e.code === 'Escape') {
      setIsEditingHolePoint(null);
    }
  }, [isEditingHolePoint]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboard);
    return () => {
      window.removeEventListener('keydown', handleKeyboard);
    }
  }, [isEditingHolePoint]);

  return (
    <React.Fragment>
      <Box sx={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
        <Box
          sx={{
            width: 220,
            flexGrow: 0,
            flexShrink: 0,
            display: 'flex',
            overflow: 'hidden',
            flexDirection: 'column'
          }}
          >
          <SidebarAccordionGroup>
            <Accordion
              expanded={panelExpanded === 'course-area'}
              onChange={handlePanelChange('course-area')}
            >
              <AccordionSummary id="course-area-header">
                <AccordionHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">Course Area</AccordionHeader>
                {/* {project.settings.centerPoint ? (<CheckIcon />) : null} */}
              </AccordionSummary>
              <AccordionDetails>
                <Stack sx={{ p: 2 }} spacing={4}>
                  
                  <Stack direction="row" alignItems="center">
                    <Box flex={1}>
                      {project.settings.centerPoint?.lat ? (
                        <Button
                          color="inherit"
                          sx={{ fontSize: 10, letterSpacing: 0, p: 1, display: 'inline-block' }}
                          onClick={() => window.meshery.copyToClipboard(`${project.settings.centerPoint.lat},${project.settings.centerPoint.lng}`)}
                          // component={Paper}
                        >
                          <code>{project.settings.centerPoint.lat.toFixed(4)}, {project.settings.centerPoint.lng.toFixed(4)}</code>
                        </Button>
                      ) : (
                        <Typography color="textSecondary">Not Set</Typography>
                      )}
                    </Box>
                    <Tooltip title="Set Center">
                      <span>
                        <IconButton
                          size="small"
                          disabled={project.dem}
                          color={isEditingCenter ? 'primary' : 'inherit'}
                          onClick={handleCenterClick}
                        >
                          <FocusIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Zoom to Area">
                      <span>
                        <IconButton
                          size="small"
                          disabled={!project.settings.centerPoint?.lat}
                          onClick={handleZoomToCenter}
                        >
                          <ZoomIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                  <Box>
                    <NumberField
                      label="Course Size (km)"
                      fullWidth={true}
                      min={0.2}
                      max={3}
                      step={0.05}
                      disabled={project.dem}
                      value={project.settings.distance}
                      size="small"
                      onChange={handleDistanceChanged}
                    />
                  </Box>

                  {/* <Stack direction="row" alignItems="center" spacing={2}>
                    <Typography sx={{ flexShrink: 0 }}>{settings.distance} km</Typography>
                    <Slider />
                  </Stack> */}
                </Stack>

              </AccordionDetails>
            </Accordion>

            <Accordion
              expanded={panelExpanded === 'elevation'}
              disabled={!project?.settings?.centerPoint}
              onChange={handlePanelChange('elevation')}
            >
              <AccordionSummary id="elevation-header">
                <AccordionHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">
                  Terrain
                </AccordionHeader>
                {/* {project.lidar ? (<CheckIcon />) : null} */}
              </AccordionSummary>
              <AccordionDetails>
                  {project.stats ? (
                    <Stack sx={{ p: 2 }} spacing={2}>
                      <ElevationStats
                        source={project?.lidar?.points ? `LAZ` : 'Mapzen DSM'}
                        size={(project?.settings?.distance || 0) * 1000}
                        height={project?.stats?.relief}
                        min={project?.stats?.min}
                        max={project?.stats?.max}
                        heightMapSize={project._heightMap?.size}
                      />
                      <Button
                        fullWidth
                        onClick={handleOpenTerrainEdit}
                        variant="contained"
                        color="secondary"
                      >
                        Edit Terrain
                      </Button>
                      {/* <Button fullWidth>Import RAW</Button> */}
                    </Stack>
                  ) : (
                    <List disablePadding={true} sx={{ p: 2 }}>
                      {availableLidar?.features.length > 0 ? (
                        [
                          <ElevationDataDownloadHeader
                            key={'lidar-header'}
                            title="Lidar Sources"
                            infoText="Lidar is higher resolution elevation data that is usually around 0.5 - 1m in resolution"
                          />,
                          ...availableLidar.features.map(feature => (
                            <ElevationDataDownload
                              key={feature.properties.name}
                              name={feature.properties.name}
                              onDownload={() => processLidar(feature)}
                            />
                          ))
                        ]
                      ): null}
                      
                      <ElevationDataDownloadHeader
                        title="DSM/DEM Sources"
                        infoText="Lower resolution digital elevation models range from 5 - 30m in resolution"
                      />
                      
                      {
                        [
                          { type: 'dem', name: 'Mapzen DEM' },
                        ].map((dem) => (
                          <ElevationDataDownload
                            key={dem.name}
                            name={dem.name}
                            onDownload={() => processLidar(dem)}
                          />
                        ))
                      }

                        {/* <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', p: 2 }}>
                          <Typography component="div" variant="caption" color="textSecondary" sx={{ textAlign: 'center' }}>
                            {`No lidar exists for this course yet :(`}
                          </Typography>
                          <Button onClick={() => processLidar({ type: 'dem', name: 'Copernicus 30m DSM' })}>
                            Use 30m DEM
                          </Button>
                        </Box> */}

                    </List>
                  )}
                

              </AccordionDetails>

            </Accordion>
            <Accordion
              expanded={panelExpanded === 'layers'}
              disabled={!project?.settings?.centerPoint || !project?._heightMap}
              onChange={handlePanelChange('layers')}
            >
              <AccordionSummary id="layers-header">
                <AccordionHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">
                  Course Layers
                </AccordionHeader>
                {/* {project._layers?.length ? (<CheckIcon />) : null} */}
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>

                <List disablePadding={true}>
                  
                  <CustomListItem
                    icon={<TonalityIcon color={!project.hillShade || layerVisibility.hillshade ? 'inherit' : 'secondary'} />}
                    // endIcon={<CheckIcon color={!!project.hillShade ? 'success' : 'secondary'} />}
                    endAction={
                      !project.hillShade && (
                        <Button
                          size="small"
                          disabled={isPending === 'hill'}
                          variant="contained"
                          color="secondary"
                          onClick={handleGenerateHillShade}
                        >
                          {isPending === 'hill' ? <CircularProgress size={14} color="inherit" /> : 'Generate'}
                        </Button>
                      )
                    }
                    hidden={!layerVisibility.hillshade}
                    label={project?.hillShade?.fileName || 'Hillshade'}
                    endIcon={(
                      isPending !== 'hill' && (
                        <IconButton size="small" color="inherit" onClick={() => handleShowHideLayer('hillshade', hillshadeLayer)}>
                          {layerVisibility.hillshade ? <Visibility /> : <VisibilityOff />}
                        </IconButton>
                      )
                    )}
                    // menuItems={project.hillShade && [
                    //   {
                    //     label: layerVisibility.hillshade ? 'Hide Layer' : 'Show Layer',
                    //     icon: layerVisibility.hillshade ? <Visibility /> : <VisibilityOff />,
                    //     onClick: () => handleShowHideLayer('hillshade', hillshadeLayer)
                    //   },
                    //   {
                    //     label: 'Generate Hillshade',
                    //     icon: <MagicIcon />,
                    //     disabled: !!project.hillShade,
                    //     onClick: handleGenerateHillShade
                    //   }
                    // ]}
                  />

                  {satelliteLayers.map(satellite => (
                    <CustomListItem
                      key={satellite.source}
                      icon={<SatelliteIcon />}
                      endAction={
                        satellite.source === 'none' && (
                          <Button
                            size="small"
                            disabled={isPending === 'sat'}
                            variant="contained"
                            color="secondary"
                            onClick={handleGenerateSatellite}
                          >
                            {isPending === 'sat' ? <CircularProgress size={14} color="inherit" /> : 'Generate'}
                          </Button>
                        )
                      }        
                      // endIcon={<CheckIcon color={satellite.source !== 'none' ? 'success' : 'secondary'} />}
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
                          label: 'Add Satellite',
                          icon: <SatelliteIcon />,
                          disabled: satelliteLayers.length === 3,
                          onClick: handleGenerateSatellite
                        }
                      ].filter(Boolean)}
                    />
                  ))}

                  
                  <CustomListItem
                    icon={<ShapeLineIcon color={layerVisibility.svg ? 'inherit' : 'secondary'} />}
                    endAction={
                      !project.svg?.fileName && (
                        <Button
                          size="small"
                          disabled={isPending === 'svg'}
                          variant="contained"
                          color="secondary"
                          onClick={handleGenerateSVG}
                        >
                          {isPending === 'svg' ? <CircularProgress size={14} color="inherit" /> : 'Generate'}
                        </Button>
                      )
                    }
                    // endIcon={<CheckIcon color={!!project.svg ? 'success' : 'secondary'} />}
                    hidden={!layerVisibility.svg}
                    secondary={project.svg?.fileName ? project.svg.fileName : 'None'}
                    label={'SVG'}
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
              </AccordionDetails>
            </Accordion>

            <Accordion
              expanded={panelExpanded === 'holes'}
              disabled={!project?.settings?.centerPoint}
              onChange={handlePanelChange('holes')}
            >
              <AccordionSummary id="holes-header">
                <AccordionHeader sx={{ flex: 1, alignContent: 'center' }} variant="h5" color="textSecondary">
                  Holes
                </AccordionHeader>
              </AccordionSummary>
              <AccordionDetails
                sx={{ overflowY: 'auto' }}
              >

                <HolesList
                  holeData={holeData}
                  editState={isEditingHolePoint}
                  onSet={setIsEditingHolePoint}
                  onClear={clearHolePoint}
                  onZoom={handleZoomToHole}
                  onRemove={handleRemoveHole}
                />
                <Box sx={{ px: 3, pb: 4 }}>
                  <Button
                    fullWidth
                    onClick={addHole}
                    disabled={holeData.length >= 18}
                    startIcon={<AddIcon />}
                    variant="contained"
                    color="secondary"
                  >
                    Add Hole
                  </Button>
                </Box>
              </AccordionDetails>
            </Accordion>
          </SidebarAccordionGroup>

        </Box>
        <div style={{ backgroundColor: '#aaa', width: '100%', height: '100%' }} id="map" ref={containerRef}></div>
        {/* This seems to get moved to the map when we add the svgOverlay */}
      </Box>

      <GenerateSatelliteDialog open={satelliteDialogOpen} onClose={handleSatelliteClosed} />
      <GenerateSVGDialog open={shapesDialogOpen} onSave={handleShapesSave} onClose={() => setShapesDialogOpen(false)} />
      <TreeLayerDialog
        open={Boolean(treeEditDialog)}
        tree={treeEditDialog}
        onSave={handleTreeSave}
        onClose={() => setTreeEditDialog(null)}
      />
      <TerrainDownloadDialog
        open={!!lidarDialogData}
        data={lidarDialogData}
        layerRef={outlineLayer}
        onClose={() => setLidarDialogData(null)}
      />
      <EditTerrainDialog
        open={terrainEditDialogOpen}
        onClose={() => setTerrainEditDialogOpen(false)}
      />
    </React.Fragment>
  );
}
