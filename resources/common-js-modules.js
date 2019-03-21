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

'use strict';

/**
 * Determines whether to transform modules to commonjs based on an
 * environment variable. Module import/export statements are not transformed
 * if the `BABEL_MODULES` env variable is set.
 */
module.exports = process.env.BABEL_MODULES ?
  () => ({}) :
  require('babel-plugin-transform-es2015-modules-commonjs');
