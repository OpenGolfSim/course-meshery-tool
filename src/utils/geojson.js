export function holeDataToGeoJSON(holeData) {
  return holeData.map(hole => ({
    type: 'FeatureCollection',
    features: [
      hole.tee?.latlng && {
        type: 'Feature',
        properties: {
          number: hole.number,
          name: `#${hole.number} Tee`,
          waypoint: 'tee'
        },
        geometry: {
          "type": "Point",
          "coordinates": hole.tee.latlng
        }
      },
      hole?.pin?.latlng &&
      {
        type: 'Feature',
        properties: {
          number: hole.number,
          name: `#${hole.number} Pin`,
          waypoint: 'pin'
        },
        geometry: {
          type: 'Point',
          coordinates: hole.pin.latlng
        }
      },
      hole?.aim?.latlng &&
      {
        type: 'Feature',
        properties: {
          number: hole.number,
          name: `#${hole.number} Aim`,
          waypoint: 'aim'
        },
        geometry: {
          "type": "Point",
          "coordinates": hole.aim.latlng
        }
      },
      hole.tee?.latlng && (hole.pin?.latlng || hole.aim?.latlng) && {
        type: "Feature",
        properties: { "name": "Connecting Line" },
        geometry: {
          type: 'LineString',
          coordinates: [
            hole.tee.latlng,
            hole.aim?.latlng,
            hole.pin?.latlng
          ].filter(Boolean)
        }
      }
    ].filter(Boolean)
  }))
}