import { ezgfx } from "./ezgfx.js";

// Init VR stuff
const xrBtn = document.getElementById('xr-button')
if(navigator.xr) {
  try {
    const support = await navigator.xr.isSessionSupported('immersive-vr')
    if(support) {
      xrBtn.disabled = false
      xrBtn.textContent = 'Enter VR'
      xrBtn.addEventListener('click', enterVr)
    }
  } catch(err) {
    console.error('Error starting VR', err)
  }
}

function onControllerUpdate(session, frame, refSpace) {
  return Array.from(session.inputSources).reduce((controllers, inputSource) => {
    if(inputSource.gripSpace) {
      const pose = frame.getPose(inputSource.gripSpace, refSpace)
      if(pose) {
        return {...controllers, [inputSource.handedness]: {pose, gamepad: inputSource.gamepad}}
      }
    }
    return controllers
  }, {})
}

// Init 3d stuff
function initWebGL(attributes) {
  const canvas = document.createElement('canvas')
  const cx = canvas.getContext('webgl2', attributes ?? {alpha: false})
  if(!cx) return alert('browser does not support webgl2')

  onresize = onResize;
  document.body.appendChild(canvas)
  onResize();

  function onResize() {
    canvas.width = canvas.clientWidth * devicePixelRatio
    canvas.height = canvas.clientHeight * devicePixelRatio
  }
  return cx
}

// VR Stuff
let xrSession = null
function enterVr() {
  if(!xrSession){
    navigator.xr.requestSession('immersive-vr', {requiredFeatures: ["local-floor"]}).then(onSessionStarted)
  } else {
    xrSession.end()
  }
}

async function onSessionStarted(_session) {
  xrSession = _session
  _session.addEventListener('end', onSessionEnded)

  const cx = initWebGL({xrCompatible: true})

  const renderer = new ezgfx.Renderer(cx)
  renderer.depthTesting(true)

  const identityMatrix = new Float32Array([
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0
  ]);

  const offsetMatrix = new Float32Array([
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    -2.0, 1.0, -10.0, 1.0
  ])

  const lightShader = {
    vertex: "\n\
    out float v_Brightness;\n\
    vec4 vertex() {\
      \
      vec3 lightDirection = normalize(vec3(1.0, -1.0, -1.0));\
      \
      vec4 worldPoint = u_Model * vec4(a_Position, 1.0);\
      vec4 worldPointPlusNormal = u_Model * vec4(a_Position + normalize(a_Normal), 1.0);\
      \
      v_Brightness = -dot(normalize(worldPointPlusNormal.xyz - worldPoint.xyz), lightDirection);\
      \
      return u_Projection * u_View * worldPoint;\
    }",
    shader: "\
    in float v_Brightness;\
    vec4 shader() {\
      return vec4(u_Color.rgb * vec3(v_Brightness), 1.0);\
    }"
  };

  const planeMesh = new ezgfx.Mesh(cx)
  await planeMesh.loadFromOBJ('/plane.obj')

  const planeMaterial = new ezgfx.Material(cx, lightShader.vertex, null, lightShader.shader)
  planeMaterial.setProjection(identityMatrix)
  planeMaterial.setView(identityMatrix)
  planeMaterial.setModel(identityMatrix)
  planeMaterial.setColor([0.5, 0.5, 0.5, 1])

  const cubeMesh = new ezgfx.Mesh(cx)
  await cubeMesh.loadFromOBJ('/cube.obj')

  const cubeMat = new ezgfx.Material(cx, lightShader.vertex, null, lightShader.shader)
  cubeMat.setProjection(identityMatrix)
  cubeMat.setView(identityMatrix)
  cubeMat.setModel(offsetMatrix)
  cubeMat.setColor([0.4, 0.3, 1, 1])

  const controllerMesh = new ezgfx.Mesh(cx)
  controllerMesh.loadFromOBJ("/controller.obj")

  const controllerMat = new ezgfx.Material(cx, lightShader.vertex, null, lightShader.shader)
  controllerMat.setProjection(identityMatrix)
  controllerMat.setView(identityMatrix)
  controllerMat.setModel(identityMatrix)

  _session.updateRenderState({baseLayer: new XRWebGLLayer(_session, cx)})
  let refSpace = await _session.requestReferenceSpace('local-floor')

  _session.requestAnimationFrame(onSessionFrame)

  function onSessionFrame(t, frame) {
    frame.session.requestAnimationFrame(onSessionFrame)

    const pose = frame.getViewerPose(refSpace)
    if(pose) {
      const {baseLayer} = frame.session.renderState

      const controllers = onControllerUpdate(frame.session, frame, refSpace)

      if(controllers.left) {
        const matrix = controllers.left.pose.transform.matrix
  
        const front = mulVecByMat(matrix, [0,0,-1,1])
        const center = mulVecByMat(matrix, [0,0,0,1])
  
        const xDir = -(front[0] - center[0])
        const zDir = front[1] - center[1]
  
        const l = Math.sqrt(xDir * xDir + zDir * zDir)
        const normXDir = xDir / l
        const normZDir = zDir / l
  
        const xOffset = (controllers.left.gamepad.axes[3] * normXDir + controllers.left.gamepad.axes[2] * normZDir) * 0.1
        const zOffset = (controllers.left.gamepad.axes[3] * normZDir + controllers.left.gamepad.axes[2] * normXDir) * 0.1
  
        refSpace = refSpace.getOffsetReferenceSpace(new XRRigidTransform({x: xOffset, y: 0, z: zOffset}))
      }

      cx.bindFramebuffer(cx.FRAMEBUFFER, baseLayer.framebuffer)
      
      renderer.clear([0.3, 1, 0.4, 1])

      pose.views.forEach((view) => {
        const {x, y, width, height} = baseLayer.getViewport(view)
        cx.viewport(x, y, width, height)

        planeMaterial.setProjection(view.projectionMatrix);
        planeMaterial.setView(view.transform.inverse.matrix);

        renderer.draw(planeMesh, planeMaterial);

        cubeMat.setProjection(view.projectionMatrix);
        cubeMat.setView(view.transform.inverse.matrix);

        renderer.draw(cubeMesh, cubeMat);
        if(controllers.left) {
          controllerAction(controllers.left, controllerMat, view, controllerMesh, renderer)
        }
        if(controllers.right) {
          controllerAction(controllers.right, controllerMat, view, controllerMesh, renderer)
        }
      })
    }
  }

  function onSessionEnded() {
    xrSession = null
  }
}

function controllerAction(controller, controllerMat, view, controllerMesh, renderer) {
  controllerMat.setProjection(view.projectionMatrix)
  controllerMat.setView(view.transform.inverse.matrix)
  controllerMat.setModel(controller.pose.transform.matrix)

  const red = controller.gamepad.buttons[0].value // trigger
  const green = controller.gamepad.buttons[1].value // grip?
  const blue = controller.gamepad.buttons[4].value // x button?

  controllerMat.setColor([red, green, blue, 1])
  renderer.draw(controllerMesh, controllerMat)
}

// this function multiplies a 4d vector by a 4x4 matrix (it applies all the matrix operations to the vector)
function mulVecByMat(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3] * v[3],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7] * v[3],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11] * v[3],
    m[12] * v[0] + m[13] * v[1] + m[14] * v[2] + m[15] * v[3],
  ]
}