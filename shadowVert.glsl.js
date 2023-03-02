export default `#version 300 es

uniform mat4 uModel;
uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uLightView;
uniform mat4 uLightProjection;
uniform vec4 uColor;
uniform vec3 uLightDir;
uniform bool uHasNormals;

in vec3 position;
in vec3 normal;

vec3 lightDir;

out vec4 vColor;
out vec4 vLightSpacePos;
out vec3 vNormal;
out vec3 vLightDir;


void main() {
    // TODO: If has normals, compute color considering it
    // TODO: compute light space position and gl_Position
    gl_Position =uProjection * uView  *uModel* vec4(position, 1);
    if(uHasNormals){
         lightDir  = normalize(vec3(1,0,1)); 
        //  float colorChange = dot(lightDir, normal);
         float colorChange = max(dot(lightDir,normal),0.25);
         vColor = vec4(colorChange*uColor.rgb, 1);
     }
     else{ 
        vColor = uColor;
     }
     
     vec4 world_trans_model  =  uModel*vec4(position,1);
 
     vLightSpacePos = uLightProjection *uLightView * vec4(world_trans_model.xyz,1);     
     vNormal =  normal; 
     vLightDir = lightDir;
}
`;