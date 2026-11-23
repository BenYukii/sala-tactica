const express = require('express');
const {
  NoSchemaIntrospectionCustomRule,
  parse,
  specifiedRules,
  validate,
  graphql
} = require('graphql');
const schema = require('./schema');
const { getSession } = require('../auth/service');
const asyncHandler = require('../../infrastructure/asyncHandler');

const router = express.Router();
const MAX_QUERY_LENGTH = 10000;
const MAX_QUERY_DEPTH = 6;
const MAX_QUERY_FIELDS = 40;
const MAX_ROOT_FIELDS = 5;
const MAX_EXECUTION_TIME_MS = 3000;

function measureQuery(document) {
  const fragments = new Map(
    document.definitions
      .filter((definition) => definition.kind === 'FragmentDefinition')
      .map((fragment) => [fragment.name.value, fragment])
  );
  let fieldCount = 0;
  let rootFieldCount = 0;
  let maxDepth = 0;

  function visitSelectionSet(selectionSet, depth, fragmentPath = new Set()) {
    for (const selection of selectionSet.selections) {
      if (selection.kind === 'Field') {
        fieldCount += 1;
        if (depth === 0) rootFieldCount += 1;
        const nextDepth = depth + 1;
        maxDepth = Math.max(maxDepth, nextDepth);
        if (selection.selectionSet) {
          visitSelectionSet(selection.selectionSet, nextDepth, fragmentPath);
        }
      } else if (selection.kind === 'InlineFragment') {
        visitSelectionSet(selection.selectionSet, depth, fragmentPath);
      } else if (selection.kind === 'FragmentSpread') {
        const fragmentName = selection.name.value;
        const fragment = fragments.get(fragmentName);
        if (fragment && !fragmentPath.has(fragmentName)) {
          const nextPath = new Set(fragmentPath);
          nextPath.add(fragmentName);
          visitSelectionSet(fragment.selectionSet, depth, nextPath);
        }
      }
    }
  }

  for (const definition of document.definitions) {
    if (definition.kind === 'OperationDefinition') {
      visitSelectionSet(definition.selectionSet, 0);
    }
  }

  return { fieldCount, maxDepth, rootFieldCount };
}

router.post('/', asyncHandler(async (req, res) => {
  const { query, variables, operationName } = req.body || {};
  if (typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ errors: [{ message: 'Se requiere una consulta GraphQL' }] });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({ errors: [{ message: 'La consulta excede el limite de longitud' }] });
  }

  let document;
  try {
    document = parse(query);
  } catch (error) {
    return res.status(400).json({ errors: [{ message: error.message }] });
  }

  const { fieldCount, maxDepth, rootFieldCount } = measureQuery(document);
  if (fieldCount > MAX_QUERY_FIELDS || maxDepth > MAX_QUERY_DEPTH || rootFieldCount > MAX_ROOT_FIELDS) {
    return res.status(400).json({
      errors: [{
        message: `La consulta excede los limites permitidos (${MAX_QUERY_FIELDS} campos, profundidad ${MAX_QUERY_DEPTH} y ${MAX_ROOT_FIELDS} campos raiz)`
      }]
    });
  }

  const validationErrors = validate(schema, document, [
    ...specifiedRules,
    NoSchemaIntrospectionCustomRule
  ]);
  if (validationErrors.length) {
    return res.status(400).json({
      errors: validationErrors.map((error) => ({ message: error.message }))
    });
  }

  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const session = match ? await getSession(match[1].trim()) : null;
  let timeoutId;
  const result = await Promise.race([
    graphql({
      schema,
      source: query,
      rootValue: null,
      contextValue: {
        user: session && {
          id: session.user_id,
          username: session.username,
          full_name: session.full_name,
          role: session.role
        }
      },
      variableValues: variables,
      operationName
    }),
    new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(null), MAX_EXECUTION_TIME_MS);
    })
  ]);
  clearTimeout(timeoutId);
  if (!result) {
    return res.status(504).json({ errors: [{ message: 'La consulta superó el tiempo máximo de ejecución' }] });
  }
  return res.json(result);
}));

module.exports = router;
