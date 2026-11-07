import {NodeIO} from '@gltf-transform/core';
import {EXTMeshoptCompression, KHRMaterialsUnlit, KHRMeshQuantization} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions([EXTMeshoptCompression,KHRMaterialsUnlit,KHRMeshQuantization]).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc=await io.read(process.argv[2]);
for(const e of doc.getRoot().listExtensionsUsed()) if(e.extensionName==='EXT_meshopt_compression') e.dispose();
await io.write(process.argv[3],doc); console.log('ok');
