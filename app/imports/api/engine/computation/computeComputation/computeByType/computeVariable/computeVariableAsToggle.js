import getAggregatorResult from './getAggregatorResult';

export default function computeVariableAsToggle(computation, node, prop) {
  let result = getAggregatorResult(node, prop) || 0;

  prop.value = !!result || !!prop.enabled || !!prop.condition?.value;
}
