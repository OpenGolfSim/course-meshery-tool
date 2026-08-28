export const MAP_SRS = 'EPSG:4326';

export const TIFF_SIZE = 8192;

export const PROJECT_FILE_PROTOCOL = 'project';
export const RESOURCES_FILE_PROTOCOL = 'resources';
export const TREE_MAKER_FILE_PROTOCOL = 'treemaker';

export const TERRAIN_DIR = 'terrain';
export const IMAGERY_DIR = 'imagery';
export const CACHE_DIR = 'cache';

export const TREE_IMPORT_PREFIX = 'tree-import';

// Tree mask resolution. Positions are stored sparsely as { i, val } where
// i = y * maskSize + x, so the size is encoded in the index and must be
// stamped on each layer. Layers saved before this existed were 512.
export const LEGACY_MASK_SIZE = 512;
export const DEFAULT_MASK_SIZE = 1024;
export const MASK_SIZES = [512, 1024, 2048];