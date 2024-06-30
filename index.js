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
        return {...controllers, [inputSource.handedness]: {pose}}
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
    -2.0, 1.0, -5.0, 1.0
  ])

  const planeMesh = new ezgfx.Mesh(cx)
  await planeMesh.loadFromOBJ('/plane.obj')

  const planeMaterial = new ezgfx.Material(null, cx)
  planeMaterial.setProjection(identityMatrix)
  planeMaterial.setView(identityMatrix)
  planeMaterial.setModel(identityMatrix)
  planeMaterial.setColor([0.5, 0.5, 0.5, 1])

  const cubeMesh = new ezgfx.Mesh(cx)
  await cubeMesh.loadFromOBJ('/cube.obj')

  const cubeMat = new ezgfx.Material(null, cx)
  cubeMat.setProjection(identityMatrix)
  cubeMat.setView(identityMatrix)
  cubeMat.setModel(offsetMatrix)
  cubeMat.setColor([0.4, 0.3, 1, 1])

  const controllerMesh = new ezgfx.Mesh(cx)
  controllerMesh.loadFromOBJ("/cube.obj")

  const controllerMat = new ezgfx.Material(null, cx)
  controllerMat.setProjection(identityMatrix)
  controllerMat.setView(identityMatrix)
  controllerMat.setModel(identityMatrix)

  _session.updateRenderState({baseLayer: new XRWebGLLayer(_session, cx)})
  const refSpace = await _session.requestReferenceSpace('local-floor')

  _session.requestAnimationFrame(onSessionFrame)

  function onSessionFrame(t, frame) {
    frame.session.requestAnimationFrame(onSessionFrame)

    const pose = frame.getViewerPose(refSpace)
    if(pose) {
      const {baseLayer} = frame.session.renderState

      const controllers = onControllerUpdate(frame.session, frame, refSpace)

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
        console.log(controllers)
        if(controllers.left) {
          controllerMat.setProjection(view.projectionMatrix)
          controllerMat.setView(view.transform.inverse.matrix)
          controllerMat.setModel(controllers.left.pose.transform.matrix)

          controllerMat.setColor([1,1,1,1])
          renderer.draw(controllerMesh, controllerMat)
        }
        if(controllers.right) {
          controllerMat.setProjection(view.projectionMatrix)
          controllerMat.setView(view.transform.inverse.matrix)
          controllerMat.setModel(controllers.right.pose.transform.matrix)

          controllerMat.setColor([0,0,0,1])
          renderer.draw(controllerMesh, controllerMat)
        }
      })
    }
  }

  function onSessionEnded() {
    xrSession = null
  }
}