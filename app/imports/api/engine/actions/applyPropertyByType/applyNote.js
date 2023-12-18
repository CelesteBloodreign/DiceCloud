import recalculateInlineCalculations from './shared/recalculateInlineCalculations';
import applyChildren from '/imports/api/engine/actions/applyPropertyByType/shared/applyChildren';
import { applyNodeTriggers } from '/imports/api/engine/actions/applyTriggers';

export default function applyNote(node, actionContext) {
  applyNodeTriggers(node, 'before', actionContext);
  const prop = node.doc

  // Log Name, summary
  let content = { name: prop.name };
  if (prop.summary?.text) {
    recalculateInlineCalculations(prop.summary, actionContext);
    content.value = prop.summary.value;
  }
  if (content.name || content.value) {
    actionContext.addLog(content);
  }
  // Log description
  if (prop.description?.text) {
    recalculateInlineCalculations(prop.description, actionContext);
    actionContext.addLog({ value: prop.description.value });
  }
  // Apply children
  await applyChildren(node, actionContext);
}
