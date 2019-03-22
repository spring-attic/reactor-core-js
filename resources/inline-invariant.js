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
 * Eliminates function call to `invariant` if the condition is met.
 *
 * Transforms:
 *
 *  invariant(<cond>, ...)
 *
 * to:
 *
 *  !<cond> ? invariant(0, ...) : undefined;
 */
module.exports = function inlineInvariant(context) {
  const t = context.types;

  return {
    visitor: {
      CallExpression: function(path) {
        var node = path.node;
        var parent = path.parent;

        if (!isAppropriateInvariantCall(node, parent)) {
          return;
        }

        var args = node.arguments.slice(0);
        args[0] = t.numericLiteral(0);

        path.replaceWith(t.ifStatement(
          t.unaryExpression('!', node.arguments[0]),
          t.expressionStatement(
            t.callExpression(
              t.identifier(node.callee.name),
              args
            )
          )
        ));
      },
    },
  };
};

function isAppropriateInvariantCall(node, parent) {
  return node.callee.type === 'Identifier'
      && node.callee.name === 'invariant'
      && node.arguments.length > 0
      && parent.type === 'ExpressionStatement';
}
