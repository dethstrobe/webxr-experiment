let gl = null; // a global gl variable, we will assign our WebGL2 context to it
export const ezgl = { // inside of this object there will be all the basic abstraction
	VertexBuffer: class { // both vertex buffer and vertex array, whereas the vertex array is here only to store the vertex layout
		constructor(gl) {
			this.gl = gl;
			this.va = gl.createVertexArray();
			gl.bindVertexArray(this.va);

			this.vb = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);

			this.stride = 0;
			this.length = 0;
			this.vertices = 0;
			
			gl.bindBuffer(gl.ARRAY_BUFFER, null);
			gl.bindVertexArray(null);
		}
		free() { // free functions - they just delete all the WebGL2 objects created with the object
			this.gl.deleteBuffer(this.vb);
			this.gl.deleteVertexArray(this.va);
		}

		vertexLayout(layout = [3, 2, 3]) { // this function supplies the vertex layout - it says how many elements there are per vertex, and how much floats they take up. we will mostly use the [3, 2, 3] combination, because it's the one used by OBJ models
			for(let i = 0; i < layout.length; i++) {
				this.stride += layout[i] * 4;
			}
			
			this.gl.bindVertexArray(this.va);
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vb);

			let istride = 0;
			for(let i = 0; i < layout.length; i++) {
				this.gl.vertexAttribPointer(i, layout[i], this.gl.FLOAT, false, this.stride, istride);
				this.gl.enableVertexAttribArray(i);

				istride += layout[i] * 4;
			}
			
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
			this.gl.bindVertexArray(null);

			this.stride = this.stride / 4;
			this.vertices = this.length / this.stride;
		}
		vertexData(data) { // simply takes in a Float32Array and supplies it to the buffer
			this.length = data.length;
			this.gl.bindVertexArray(this.va);
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vb);
			this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data), this.gl.STATIC_DRAW);
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
			this.gl.bindVertexArray(null);
			this.vertices = this.length / this.stride;
		}
		draw() { // draws our mesh
			this.gl.bindVertexArray(this.va);
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vb);

			this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertices);

			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
			this.gl.bindVertexArray(null);
		}
		
	},
	SubShader: class { // known as shader in WebGL2, simply contains shader code and type
		constructor(type, str, gl) {
			this.shader = gl.createShader(type);
			this.gl = gl;
			gl.shaderSource(this.shader, str);
			gl.compileShader(this.shader);
		}
		free() {
			this.gl.deleteShader(this.shader);
		}
	},
	Shader: class { // known as a program in WebGL2, just joins and links shaders
		constructor(gl) {
			this.gl = gl;
			this.program = gl.createProgram();
		}
		free() {
			this.gl.deleteProgram(this.program);
		}

		join(subshader) {
			this.gl.attachShader(this.program, subshader.shader);
			return this;
		}
		link() {
			this.gl.linkProgram(this.program);
			this.gl.useProgram(this.program);
			this.gl.useProgram(null);
			return this;
		}

		bind() {
			this.gl.useProgram(this.program);
			return this;
		}
		unbind() {
			this.gl.useProgram(null);
			return this;
		}

		// these are used for setting uniforms in shaders
		set1i(name, val) { // mostly for texture IDs
			this.gl.uniform1i(this.gl.getUniformLocation(this.program, name), val);
			return this;
		}
		set1f(name, val) { // maybe will find some kind of a use
			this.gl.uniform1f(this.gl.getUniformLocation(this.program, name), val);
			return this;
		}
		set2f(name, x, y) { // maybe will find some kind of a use 
			this.gl.uniform2f(this.gl.getUniformLocation(this.program, name), x, y);
			return this;
		}
		set3f(name, x, y, z) { // maybe will find some kind of a use 
			this.gl.uniform3f(this.gl.getUniformLocation(this.program, name), x, y, z);
			return this;
		}
		set4f(name, x, y, z, w) { // maybe will find some kind of a use (most likely colors)
			this.gl.uniform4f(this.gl.getUniformLocation(this.program, name), x, y, z, w);
			return this;
		}
		set4x4f(name, mat) { // for matrices (projection, view, model)
			this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, name), false, mat);
			return this;
		}
	},
	Texture: class { // Just a simple texture, and it can be loaded from a file
		constructor() {
			this.texture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, this.texture);
			gl.bindTexture(gl.TEXTURE_2D, null);
		}
		free() {
			gl.deleteTexture(this.texture);
		}

		fromFile(url, options = {wrap: gl.REPEAT, filter: gl.NEAREST}) {
			gl.bindTexture(gl.TEXTURE_2D, this.texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 255, 255]));
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, options.wrap);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, options.wrap);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.filter);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options.filter);
			let that = this;
			const img = new Image();
			img.onload = function() {
				gl.bindTexture(gl.TEXTURE_2D, that.texture);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
			};
			img.src = url;
		}
		fromData(data, options = {wrap: gl.REPEAT, filter: gl.NEAREST}) {
			gl.bindTexture(gl.TEXTURE_2D, this.texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data));
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, options.wrap);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, options.wrap);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.filter);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options.filter);
		}

		bind(slot = 0) {
			gl.activeTexture(gl.TEXTURE0 + slot);
			gl.bindTexture(gl.TEXTURE_2D, this.texture);
		}
	}
};