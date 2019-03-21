/**
 * Copyright (c) 2016-2018 Pivotal Software Inc, All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Ensure a vanilla package.json before deploying so other tools do not
 * interpret the built output as requiring any further transformation.
 */

const fs = require('fs');

const package = require('../package.json');
delete package.scripts;
delete package.options;
delete package.devDependencies;
fs.writeFileSync('./dist/package.json', JSON.stringify(package, null, 2));
