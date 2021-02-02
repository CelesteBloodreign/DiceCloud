export default function findAncestorByType({type, prop, memo}){
  if (!prop || !prop.ancestors) return;
  let ancestor;
  for (let i = prop.ancestors.length - 1; i >= 0; i--){
    ancestor = memo.propsById[prop.ancestors[i].id];
    if (ancestor && ancestor.type === type){
      return ancestor;
    }
  }
}
