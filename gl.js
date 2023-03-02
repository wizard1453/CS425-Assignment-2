import layerVertShaderSrc from './layerVert.glsl.js';
import layerFragShaderSrc from './layerFrag.glsl.js';
import shadowFragShaderSrc from './shadowFrag.glsl.js';
import shadowVertShaderSrc from './shadowVert.glsl.js';
import depthFragShaderSrc from './depthFrag.glsl.js';
import depthVertShaderSrc from './depthVert.glsl.js';

var gl;

var layers = null
var renderToScreen = null;
var fbo = null;
var currRotate = 0;
var currLightRotate = 0;
// var currLightDirection = null;
var currZoom = 0;
var currProj = 'perspective';
var currResolution = 2048;
var displayShadowmap = false;

var modelMatrix = identityMatrix();
var projectionMatrix = identityMatrix();
var viewMatrix = identityMatrix()
var lightProjectionMatrix = identityMatrix();
var lightViewMatrix = identityMatrix();

var curR = 0;
var prev_r = 0;
var prev_rlight = 0;

/*
    FBO
*/
class FBO {
    constructor(size) {
        // TODO: Create FBO and texture with size
        this.texture = createTexture2D(gl, size, size, gl.DEPTH_COMPONENT32F, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null, gl.NEAREST, gl.NEAREST, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE);
        this.fbo = createFBO(gl, gl.DEPTH_ATTACHMENT, this.texture);
        this.size = size;
    }

    start() {
        // TODO: Bind FBO, set viewport to size, clear depth buffer
        gl.viewport(0, 0, this.size, this.size);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.clear(gl.DEPTH_BUFFER_BIT);
    }

    stop() {
        // TODO: unbind FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
}

/*
    Shadow map
*/
class ShadowMapProgram {
    constructor() {
        this.vertexShader = createShader(gl, gl.VERTEX_SHADER, shadowVertShaderSrc);
        this.fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, shadowFragShaderSrc);
        this.program = createProgram(gl, this.vertexShader, this.fragmentShader);

        this.posAttribLoc = gl.getAttribLocation(this.program, "position");
        this.colorAttribLoc = gl.getUniformLocation(this.program, "uColor");
        this.modelLoc = gl.getUniformLocation(this.program, "uModel");
        this.projectionLoc = gl.getUniformLocation(this.program, "uProjection");
        this.viewLoc = gl.getUniformLocation(this.program, "uView");
        this.lightViewLoc = gl.getUniformLocation(this.program, "uLightView");
        this.lightProjectionLoc = gl.getUniformLocation(this.program, "uLightProjection");
        this.samplerLoc = gl.getUniformLocation(this.program, "uSampler");
        this.hasNormalsAttribLoc = gl.getUniformLocation(this.program, "uHasNormals");
        this.lightDirAttribLoc = gl.getUniformLocation(this.program, "uLightDir");
    }

    use() {
        // TODO: use program
        gl.useProgram(this.program);
    }
}

/*
    Render to screen program
*/
class RenderToScreenProgram {
    constructor() {
        this.vertexShader = createShader(gl, gl.VERTEX_SHADER, depthVertShaderSrc);
        this.fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, depthFragShaderSrc);

        this.program = createProgram(gl, this.vertexShader, this.fragmentShader);
        this.posAttribLoc = gl.getAttribLocation(this.program, "position");
        this.samplerLoc = gl.getUniformLocation(this.program, "uSampler");

        // TODO: Create quad VBO and VAO
        // A initial quad consists of two triangles
        this.vert = [-1, -1, 0, 1, -1, 0, 1, 1, 0, 1, 1, 0, -1, -1, 0, -1, 1, 0];
        this.vertexBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(this.vert));
        this.vao = createVAO(gl, this.posAttribLoc, this.vertexBuffer);
    }

    draw(texture) {
        // TODO: Render quad and display texture
        gl.useProgram(this.program);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(this.samplerLoc, 0);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}

/*
    Layer program
*/
class LayerProgram {
    constructor() {
        this.vertexShader = createShader(gl, gl.VERTEX_SHADER, layerVertShaderSrc);
        this.fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, layerFragShaderSrc);
        this.program = createProgram(gl, this.vertexShader, this.fragmentShader);

        this.posAttribLoc = gl.getAttribLocation(this.program, "position");
        this.colorAttribLoc = gl.getUniformLocation(this.program, "uColor");
        this.modelLoc = gl.getUniformLocation(this.program, "uModel");
        this.projectionLoc = gl.getUniformLocation(this.program, "uProjection");
        this.viewLoc = gl.getUniformLocation(this.program, "uView");
    }

    use() {
        gl.useProgram(this.program);
    }
}

/*
    Collection of layers
*/
class Layers {
    constructor() {
        this.layers = {};
        this.centroid = [0, 0, 0];
    }

    addLayer(name, vertices, indices, color, normals) {
        if (normals == undefined)
            normals = null;
        var layer = new Layer(vertices, indices, color, normals);
        layer.init();
        this.layers[name] = layer;
        this.centroid = this.getCentroid();
    }

    removeLayer(name) {
        delete this.layers[name];
    }

    draw(modelMatrix, viewMatrix, projectionMatrix, lightViewMatrix = null, lightProjectionMatrix = null, shadowPass = false, texture = null) {
        for (var layer in this.layers) {
            if (layer == 'surface') {
                gl.polygonOffset(1, 1);
            }
            else {
                gl.polygonOffset(0, 0);
            }
            this.layers[layer].draw(modelMatrix, viewMatrix, projectionMatrix, lightViewMatrix, lightProjectionMatrix, shadowPass, texture);
        }
    }

    getCentroid() {
        var sum = [0, 0, 0];
        var numpts = 0;
        for (var layer in this.layers) {
            numpts += this.layers[layer].vertices.length / 3;
            for (var i = 0; i < this.layers[layer].vertices.length; i += 3) {
                var x = this.layers[layer].vertices[i];
                var y = this.layers[layer].vertices[i + 1];
                var z = this.layers[layer].vertices[i + 2];

                sum[0] += x;
                sum[1] += y;
                sum[2] += z;
            }
        }
        return [sum[0] / numpts, sum[1] / numpts, sum[2] / numpts];
    }
}

/*
    Layers without normals (water, parks, surface)
*/
class Layer {
    constructor(vertices, indices, color, normals = null) {
        this.vertices = vertices;
        this.indices = indices;
        this.color = color;
        this.normals = normals;

        this.hasNormals = false;
        if (this.normals) {
            this.hasNormals = true;
        }
    }

    init() {
        this.layerProgram = new LayerProgram();
        this.shadowProgram = new ShadowMapProgram();

        this.vertexBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(this.vertices));
        this.indexBuffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.indices));

        if (this.normals) {
            this.normalBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(this.normals));
            this.vao = createVAO(gl, 0, this.vertexBuffer, 1, this.normalBuffer);
        }
        else {
            this.vao = createVAO(gl, 0, this.vertexBuffer);
        }
    }

    draw(modelMatrix, viewMatrix, projectionMatrix, lightViewMatrix, lightProjectionMatrix, shadowPass = false, texture = null) {
        // TODO: Handle shadow pass (using ShadowMapProgram) and regular pass (using LayerProgram)
        // shadowPass --> true use lightProjectionMatrix
        //            --> false use normal matrix, regular viewmatrix
        if (!shadowPass) {
            this.layerProgram.use();
            gl.uniformMatrix4fv(this.layerProgram.modelLoc, false, new Float32Array(modelMatrix));
            gl.uniformMatrix4fv(this.layerProgram.projectionLoc, false, new Float32Array(lightProjectionMatrix));
            gl.uniformMatrix4fv(this.layerProgram.viewLoc, false, new Float32Array(lightViewMatrix));
            gl.uniform4fv(this.layerProgram.colorAttribLoc, this.color);
        } else {
            this.shadowProgram.use();

            gl.uniform1i(this.shadowProgram.hasNormalsAttribLoc, this.hasNormals);

            gl.uniformMatrix4fv(this.shadowProgram.modelLoc, false, new Float32Array(modelMatrix))
            gl.uniformMatrix4fv(this.shadowProgram.projectionLoc, false, new Float32Array(projectionMatrix))
            gl.uniformMatrix4fv(this.shadowProgram.viewLoc, false, new Float32Array(viewMatrix));
            gl.uniformMatrix4fv(this.shadowProgram.lightProjectionLoc, false, new Float32Array(lightProjectionMatrix));
            gl.uniformMatrix4fv(this.shadowProgram.lightViewLoc, false, new Float32Array(lightViewMatrix));

            gl.uniform4fv(this.shadowProgram.colorAttribLoc, this.color);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);

            gl.uniform1i(this.shadowProgram.samplerLoc, 0);
        }

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_INT, 0);
    }
}

/*
    Event handlers
*/
window.updateRotate = function () {
    currRotate = parseInt(document.querySelector("#rotate").value);

    if (!displayShadowmap) {
        curR = curR + (currRotate - prev_r);
        prev_r = currRotate;
    }
}

window.updateLightRotate = function () {
    currLightRotate = parseInt(document.querySelector("#lightRotate").value);

    curR = curR + (currLightRotate - prev_rlight);
    prev_rlight = currLightRotate;
}

window.updateZoom = function () {
    currZoom = parseFloat(document.querySelector("#zoom").value);
}

window.updateProjection = function () {
    currProj = document.querySelector("#projection").value;
}

window.displayShadowmap = function (e) {
    displayShadowmap = e.checked;
}

/*
    File handler
*/
window.handleFile = function (e) {
    var reader = new FileReader();
    reader.onload = function (evt) {
        var parsed = JSON.parse(evt.target.result);
        console.log(parsed);
        for (var layer in parsed) {
            var aux = parsed[layer];
            layers.addLayer(layer, aux['coordinates'], aux['indices'], aux['color'], aux['normals']);
        }
    }
    reader.readAsText(e.files[0]);
}

/*
    Update transformation matrices
*/
function updateModelMatrix(centroid) {
    var rotateZ = rotateZMatrix((currRotate) * Math.PI / 180.0);

    var position = translateMatrix(centroid[0], centroid[1], centroid[2]);
    var scale = translateMatrix(-centroid[0], -centroid[1], -centroid[2]);

    if (!displayShadowmap) {
        modelMatrix = multiplyArrayOfMatrices([
            position,
            rotateZ,
            scale
        ]);
    }
    else {
        modelMatrix = identityMatrix();
    }
}

function updateProjectionMatrix() {
    // TODO: Projection matrix
    // var projectionMatrix = identityMatrix();
    var aspect = window.innerWidth / window.innerHeight;

    if (currProj == "perspective") {
        projectionMatrix = perspectiveMatrix(45 * Math.PI / 180, aspect, 1, 50000);
    }
    else {
        var size = 5000 - (currZoom / 100.0) * 5000 * 0.99;
        projectionMatrix = orthographicMatrix(-aspect * size, aspect * size, -1 * size, 1 * size, -1, 50000);
    }

    // return projectionMatrix;
}

function updateViewMatrix(centroid) {
    // TODO: View matrix
    // var viewMatrix = identityMatrix();
    var zoom = 3000 - (currZoom / 100.0) * 3000 * 0.99;

    var eye = add(centroid, [zoom, zoom, zoom]);
    var camera = lookAt(eye, centroid, [0, 0, 1]);

    var position = translateMatrix(0, 0, -zoom);

    viewMatrix = multiplyArrayOfMatrices([
        position,
        camera
    ]);

    // return viewMatrix;
}

function updateLightViewMatrix(centroid) {
    // TODO: Light view matrix
    // var lightViewMatrix = identityMatrix();
    // return lightViewMatrix;

    if (!displayShadowmap) {
        var x = 2000 * Math.cos((curR) * Math.PI / 180.0);
        var y = 2000 * Math.sin((curR) * Math.PI / 180.0);
        var camera = lookAt(add(centroid, [-x, y, 2000]), centroid, [0, 0, 1]);
    }
    else {
        var x = 2000 * Math.cos(curR * Math.PI / 180.0);
        var y = 2000 * Math.sin(curR * Math.PI / 180.0);
        var camera = lookAt(add(centroid, [x, y, 2000]), centroid, [0, 0, 1]);
    }

    lightViewMatrix = camera;
}

function updateLightProjectionMatrix() {
    // TODO: Light projection matrix
    // var lightProjectionMatrix = identityMatrix();
    // return lightProjectionMatrix;

    if (!displayShadowmap) {
        var maxzoom = 2400;
        lightProjectionMatrix = orthographicMatrix(-1 * maxzoom, 1 * maxzoom, -1 * maxzoom, 1 * maxzoom, -1, 20000);
    }
    else {
        var maxzoom = 2400;
        lightProjectionMatrix = orthographicMatrix(-1 * maxzoom, 1 * maxzoom, -1 * maxzoom, 1 * maxzoom, -1, 20000);
    }
}

/*
    Main draw function (should call layers.draw)
*/
function draw() {

    gl.clearColor(190 / 255, 210 / 255, 215 / 255, 1);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // TODO: First rendering pass, rendering using FBO
    fbo.start();
    // updating matrides and drawing
    updateModelMatrix(layers.centroid);
    updateProjectionMatrix();
    updateViewMatrix(layers.centroid);
    updateLightViewMatrix(layers.centroid);
    updateLightProjectionMatrix();
    // layers.draw(...);
    layers.draw(modelMatrix, viewMatrix, projectionMatrix, lightViewMatrix, lightProjectionMatrix, false, null);
    fbo.stop();

    if (!displayShadowmap) {
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        // TODO: Second rendering pass, render to screen
        layers.draw(modelMatrix, viewMatrix, projectionMatrix, lightViewMatrix, lightProjectionMatrix, true, fbo.texture);
    }
    else {
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        // TODO: Render shadowmap texture computed in first pass
        renderToScreen.draw(fbo.texture);
    }

    requestAnimationFrame(draw);
}

/*
    Initialize everything
*/
function initialize() {

    var canvas = document.querySelector("#glcanvas");
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    gl = canvas.getContext("webgl2");

    mouseMove();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    gl.enable(gl.POLYGON_OFFSET_FILL);

    layers = new Layers();
    fbo = new FBO(currResolution);
    renderToScreen = new RenderToScreenProgram();

    window.requestAnimationFrame(draw);

}


window.onload = initialize;

// When true, moving the mouse draws on the canvas
let isDrawing = false;
let x = 0;
let y = 0;

var sliderX;
var sliderY
var EleSliderX = document.getElementById("rotate");
var EleSliderY = document.getElementById("zoom");

function mouseMove() {
    // Add the event listeners for mousedown, mousemove, and mouseup
    var myPics = document.getElementById("glcanvas");
    myPics.addEventListener('mousedown', e => {
        x = e.offsetX;
        y = e.offsetY;

        sliderX = x / myPics.clientWidth * 360;
        sliderY = y / myPics.clientHeight * 100;

        EleSliderX.value = sliderX;
        EleSliderY.value = sliderY;

        isDrawing = true;

        updateRotate();
        updateZoom();
    });

    myPics.addEventListener('mousemove', e => {
        if (isDrawing === true) {
            // drawLine(context, x, y, e.x, e.y);
            x = e.x;
            y = e.y;

            sliderX = x / myPics.clientWidth * 360;
            sliderY = y / myPics.clientHeight * 100;

            EleSliderX.value = sliderX;
            EleSliderY.value = sliderY;

            updateRotate();
            updateZoom();
        }
    });

    myPics.addEventListener('mouseup', e => {
        if (isDrawing === true) {
            x = 0;
            y = 0;
            isDrawing = false;
        }

        updateRotate();
        updateZoom();
    });
}