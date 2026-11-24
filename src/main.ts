import { createPlatform } from './platform';
import { CatBoomApp } from './gameApp';

const platform = createPlatform();
const app = new CatBoomApp(platform);
app.start();
