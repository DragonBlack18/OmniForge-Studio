import ELK from 'elkjs/lib/elk.bundled.js';

const engine = new ELK({algorithms:['layered']});
self.onmessage = async event => {
  const {id,graph} = event.data || {};
  try {
    const result = await engine.layout(graph);
    // Only coordinates cross back to the editor; ELK metadata is discarded.
    self.postMessage({id,layout:{children:result.children.map(node=>({id:node.id,x:node.x,y:node.y}))}});
  }catch(error){
    self.postMessage({id,error:String(error?.message || 'Falha ao organizar o fluxo.').slice(0,250)});
  }
};
