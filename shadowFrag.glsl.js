export default `#version 300 es
precision highp float;

uniform sampler2D uSampler;

in vec4 vColor;
in vec4 vLightSpacePos;
out vec4 outColor;

in vec3 vNormal ;
in vec3 vLightDir; 

// vec3 shadowCalculation(vec4 lightSpacePos) {
float shadowCalculation(vec4 lightSpacePos) {
    // TODO: shadow calculation

    vec3 projCoords =  lightSpacePos.xyz / lightSpacePos.w;
    projCoords = projCoords * 0.5 + 0.5; 

    float closestDepth = texture(uSampler, projCoords.xy).r;
    // float currentDepth = projCoords.z;
    // deal with shadow acne
    float currentDepth = projCoords.z-0.00056;
   
    float shadow = currentDepth > closestDepth  ? 1.0 : 0.0;  
    
    return shadow;

}

void main() {
    // TODO: compute shadowmap coordenates 
    float shadow =  shadowCalculation(vLightSpacePos);

    // TODO: evaluate if point is in shadow or not
    // shadow == 1 -> shadow
    //           0 -> normal color
    outColor = vec4((vColor * (1.0-shadow)).rgb, 1.0);
}
`;