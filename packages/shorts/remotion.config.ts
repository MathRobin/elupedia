// Configuration de Remotion Studio (`yarn preview`) : même alias d'extensions
// que le rendu programmatique (voir src/render.ts).
import { Config } from '@remotion/cli/config';
import { webpackOverride } from './src/render.js';

Config.overrideWebpackConfig(webpackOverride);
