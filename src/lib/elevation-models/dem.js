/**
 * Get all Copernicus GLO-30 tile paths that intersect a bounding box
 */
export function getCopernicusTilePaths(bounds) {
  const tiles = [];

  // Floor to get tile origins — tiles are 1°×1° aligned to integer degrees
  const latMin = Math.floor(bounds.south);
  const latMax = Math.floor(bounds.north);
  const lonMin = Math.floor(bounds.west);
  const lonMax = Math.floor(bounds.east);

  for (let lat = latMin; lat <= latMax; lat++) {
    for (let lon = lonMin; lon <= lonMax; lon++) {
      const ns = lat >= 0 ? 'N' : 'S';
      const ew = lon >= 0 ? 'E' : 'W';

      const latStr = String(Math.abs(lat)).padStart(2, '0');
      const lonStr = String(Math.abs(lon)).padStart(3, '0');

      const tile = `Copernicus_DSM_COG_10_${ns}${latStr}_00_${ew}${lonStr}_00_DEM`;

      tiles.push(`/vsis3/copernicus-dem-30m/${tile}/${tile}.tif`);
    }
  }

  return tiles;
}
