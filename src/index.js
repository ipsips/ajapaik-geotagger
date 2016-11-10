import style from './style.scss'
import iconPoi from './pin-poi.svg'
import iconPhotographer from './pin-photographer.svg'

/**
 * @todo Test for a situation where map canvas is on a scrollable page
 */

const gMapsApiKey = 'AIzaSyABD20a8ycEbrpUZdTOAhYUc0FrJwL8ZxE'
const transformProp = (() => {
  const testEl = document.createElement('div')
  const vendors = ['Webkit', 'Moz', 'ms']
  
  if (testEl.style.transform == null)
    for (let vendor in vendors)
      if (testEl.style[vendors[vendor] + 'Transform'] !== undefined)
        return vendors[vendor] + 'Transform'

  return 'transform'
})()


/* Change the localhost with ip in the url
 * to make it work in LAN during dev
 */
const replaceHost = (val) => val.replace(/(https?):\/\/[^\/]+(\/?.*)/, `$1://${location.host}$2`)

class Location {
  constructor(label, url, onChange) {
    this.label = label
    this.url = url
    this._position = null
    this.onChange = onChange

    if (!PRODUCTION)
      this.url = replaceHost(this.url)
  }
  set position(value) {
    if (typeof value !== 'undefined')
      this._position = value

    if (typeof this.onChange === 'function')
      this.onChange()
  }
  get position() {
    return this._position
      ? this._position.toJSON()
      : null
  }
  reset = () => {
    this._position = null
  }
}

export default
class AjapaikGeotagger {
  earthRadiusKm = 6371
  polygonStyles = {
    focus: {
      strokeOpacity: 0,
      icons: [{
        icon: {
          path: 'M 0,0 0,2',
          strokeOpacity: 1,
          strokeWeight: 1.5,
          strokeColor: '#f00'
        },
        offset: 0,
        repeat: '10px'
      }]
    }
  }
  constructor({ canvas, onChange, map, mapOptions }) {
    if (!canvas && !map)
      return console.error('AjapaikGeotagger: you must specify either a canvas element (options.canvas) or an already initiated google map (options.map)')

    this.canvas = canvas
    this.onChange = onChange
    this.map = map
    this.mapOptions = mapOptions
    this.state = this.getDefaultState()
    this.ensureGoogleMapsApi()
  }
  _onChange = () => {
    this.state.pristine = false

    const output = {
      poi: this.state.points.poi.position,
      photographer: this.state.points.photographer.position,
      distance: this.state.distance,
      heading: this.state.heading
    }

    if (!PRODUCTION)
      console.log({ state: this.state, output })

    typeof this.onChange === 'function'
        && this.onChange(output)
  }
  onLocationChange = () => {
    this._onChange()
  }
  reset = () => {
    Object.keys(this.state.points).forEach(key => {
      this.state.points[key].icon.classList.remove(style.placed)
      this.state.points[key].icon.dataset.clientX = undefined
      this.state.points[key].icon.dataset.clientY = undefined
      this.state.points[key].icon.dataset.offsetX = undefined
      this.state.points[key].icon.dataset.offsetY = undefined
      this.state.points[key].icon.dataset.pinX = undefined
      this.state.points[key].icon.dataset.pinY = undefined
      this.state.points[key].placeholder.classList.remove(style.visible)
      
      if (this.state.points[key].marker) {
        this.state.points[key].marker.setMap(null)
        delete this.state.points[key].marker
      }
    })

    if (this.perspective) {
      this.perspective.setMap(null)
      delete this.perspective
    }

    this.state = this.getDefaultState()
    this._onChange()
    this.state.pristine = true
  }
  getDefaultState = () => {
    const _this = this
    const state = {
      _pristine: true,
      set pristine(value) {
        /**
         * If pristine changes then the reset button shows/hides.
         * Calling setZoom has the side-effect of re-centering
         * the geotagger control.
         */
        // if (this._pristine != value)
        //   setTimeout(() => _this.map.setZoom(_this.map.getZoom()))

        this._pristine = value
        _this.geotaggerControl.classList.toggle(style.notPristine, !this._pristine)
      },
      get pristine() {
        return this._pristine
      },
      points: {
        poi: this.state ? this.state.points.poi : new Location('Point Of Interest', iconPoi, this.onLocationChange),
        photographer: this.state ? this.state.points.photographer : new Location('Photographer', iconPhotographer, this.onLocationChange)
      },
      distance: null,
      heading: null
    }

    if (this.state) {
      state.points.poi.reset()
      state.points.photographer.reset()
    }

    return state
  }
  ensureGoogleMapsApi = () => {
    if (
      typeof google === 'object' &&
      typeof google.maps === 'object'
    )
      return this.initMap()

    this.globalInstanceId = `ajapaikGeotagger_${Date.now()}`
    window[this.globalInstanceId] = this

    /* make sure it works with file:// */
    const protocol = location.protocol.indexOf('http' > -1) ? location.protocol : 'https:'
    const script = document.createElement('script')

    script.src = `${protocol}//maps.googleapis.com/maps/api/js?libraries=geometry&key=${gMapsApiKey}&callback=${this.globalInstanceId}.initMap`
    script.defer = true

    ;(s =>
      s.parentNode.insertBefore(script, s)
    )(
      document.getElementsByTagName('script')[0]
    )
  }
  initMap = () => {
    this.mapOptions = {
      center: {
        lat: 59.4370,
        lng: 24.7536
      },
      zoom: 15,
      zoomControlOptions: {
        position: google.maps.ControlPosition.TOP_RIGHT
      },
      streetViewControlOptions: {
        position: google.maps.ControlPosition.TOP_RIGHT
      },
      mapTypeId: 'OSM',
      mapTypeControlOptions: {
          mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE, 'OSM'],
          position: google.maps.ControlPosition.TOP_RIGHT,
          style: google.maps.MapTypeControlStyle.DROPDOWN_MENU
      },
      ...this.mapOptions
    }

    if (!this.map)
      this.map = new google.maps.Map(this.canvas, this.mapOptions)

    this.map.mapTypes.set(
      'OSM',
      new google.maps.ImageMapType({
        getTileUrl: (coord, zoom) => `http://tile.openstreetmap.org/${zoom}/${coord.x}/${coord.y}.png`,
        tileSize: new google.maps.Size(256, 256),
        name: 'OSM',
        maxZoom: 18
      })
    )

    if (!this.canvas)
      this.canvas = this.map.getDiv()

    this.markerOverlay = new google.maps.OverlayView()
    this.markerOverlay.draw = () => {}
    this.markerOverlay.setMap(this.map)
    this.createGeotaggerControl()
  }
  createGeotaggerControl = () => {
    const geotaggerControl = document.createElement('div')
    const iconPlaceholders = document.createElement('div')

    geotaggerControl.setAttribute('class', style.geotaggerControl)
    geotaggerControl.appendChild(iconPlaceholders)
    iconPlaceholders.setAttribute('class', style.iconPlaceholders)

    Object.keys(this.state.points).forEach(key => {
      const icon = document.createElement('i')
      const iconPlaceholder = document.createElement('i')
      
      icon.classList.add(style.icon, style[key])
      icon.setAttribute('title', this.state.points[key].label)
      geotaggerControl.appendChild(icon)

      iconPlaceholder.classList.add(style.icon, style[key], style.iconPlaceholder)
      iconPlaceholders.appendChild(iconPlaceholder)

      this.state.points[key].icon = icon
      this.state.points[key].placeholder = iconPlaceholder
      this.makeIconDraggable(key, icon, iconPlaceholder)
    })

    geotaggerControl.appendChild(this.createResetButton())

    this.geotaggerControl = geotaggerControl

    this.map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(geotaggerControl)

    if (!PRODUCTION)
      google.maps.event.addListenerOnce(this.map, 'idle', () => {
        Object.keys(this.state.points).forEach(key => {

          ;['icon', 'placeholder'].forEach(icon => {
            const bg = window
              .getComputedStyle(this.state.points[key][icon])
              .getPropertyValue('background-image')

            this.state.points[key][icon].style.backgroundImage = replaceHost(bg)
          })
        })
      })
  }
  createResetButton = () => {
    const resetBtnWrapper = document.createElement('div')
    const resetBtn = document.createElement('button')
    
    resetBtnWrapper.classList.add(style.resetBtnWrapper)
    resetBtnWrapper.appendChild(resetBtn)

    resetBtn.classList.add(style.resetBtn)
    resetBtn.innerHTML = 'Reset'
    resetBtn.addEventListener('click', this.reset)

    this.resetBtnWrapper = resetBtnWrapper

    return resetBtnWrapper
  }
  makeIconDraggable = (key, icon, iconPlaceholder) => {
    icon.setAttribute('draggable', true)
    icon.addEventListener('dragstart' , this.onDragStart.bind(this, key, icon, iconPlaceholder))
    icon.addEventListener('touchstart', this.onDragStart.bind(this, key, icon, iconPlaceholder))
    icon.addEventListener('drag'      , this.onDrag.bind(this, key, icon, iconPlaceholder))
    icon.addEventListener('touchmove' , this.onDrag.bind(this, key, icon, iconPlaceholder))
    icon.addEventListener('dragend'   , this.onDragEnd.bind(this, key, icon, iconPlaceholder))
    icon.addEventListener('touchend'  , this.onDragEnd.bind(this, key, icon, iconPlaceholder))
  }
  onDragStart = (key, icon, iconPlaceholder, evt) => {
    const c = evt.type == 'touchstart'
      ? evt.touches[0]
      : evt
    const offset = this.getIconClientOffset(icon, evt, c)

    icon.dataset.clientX = c.clientX || 0
    icon.dataset.clientY = c.clientY || 0
    icon.dataset.offsetX = offset.x || 0
    icon.dataset.offsetY = offset.y || 0
    icon.classList.add(style.dragging)

    iconPlaceholder.classList.add(style.visible)
    
    if (evt.dataTransfer) {
      /* set transparent drag preview */
      const dragPreview = new Image()
      dragPreview.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAADElEQVQImWNgoBMAAABpAAFEI8ARAAAAAElFTkSuQmCC'
      evt.dataTransfer.setDragImage(dragPreview, 0, 0)
    }
  }
  getIconClientOffset = (icon, evt, c) => {
    if (typeof evt.offsetX === 'number')
      return {
        x: evt.offsetX,
        y: evt.offsetY
      }
    else {
      const iconRect = icon.getBoundingClientRect()
      return {
        x: c.clientX - iconRect.left,
        y: c.clientY - iconRect.top
      }
    }
  }
  onDrag = (key, icon, iconPlaceholder, evt) => {
    const c = evt.type == 'touchmove'
      ? evt.touches[0]
      : evt

    if (evt.type == 'touchmove') {
      evt.stopPropagation()
      evt.preventDefault()
    }

    if (c.clientX || c.clientY) {
      icon.style[transformProp] = `
        translateX(${c.clientX - icon.dataset.clientX}px)
        translateY(${c.clientY - icon.dataset.clientY}px)`

      icon.dataset.pinX = c.clientX - icon.dataset.offsetX + 24
      icon.dataset.pinY = c.clientY - icon.dataset.offsetY + 48

      this.setPerspective()
    }
  }
  onDragEnd = (key, icon, iconPlaceholder, evt) => {
    icon.style[transformProp] = `none`
    icon.classList.remove(style.dragging)
    icon.classList.add(style.placed)
    
    this.placeMarker(key, icon)
  }
  placeMarker = (key, icon) => {
    const size = new google.maps.Size(48, 48)
    const position = this.getMarkerPositionFromPixels(key)
    const marker = new google.maps.Marker({
      position,
      map: this.map,
      draggable: true,
      crossOnDrag: false,
      title: this.state.points[key].label,
      icon: {
        url: this.state.points[key].url,
        size,
        scaledSize: size
      }
    })

    marker.addListener('drag', () => {
      this.setPerspective()
    })
    marker.addListener('dragend', () => {
      this.state.points[key].position = marker.getPosition()
    })

    this.state.points[key].marker = marker
    this.state.points[key].position = position
  }
  setPerspective = () => {
    const poiPosition = this.getMarkerPosition('poi')
    const photographerPosition = this.getMarkerPosition('photographer')

    if (!poiPosition || !photographerPosition)
      return

    const heading = google.maps.geometry.spherical.computeHeading(photographerPosition, poiPosition)
    const distance = google.maps.geometry.spherical.computeDistanceBetween(photographerPosition, poiPosition)

    this.state.distance = distance
    this.state.heading = heading

    if (!this.perspective)
      this.perspective = new google.maps.Polyline({
        ...this.polygonStyles.focus,
        map: this.map,
        path: [ poiPosition, photographerPosition ],
        clickable: false
      })
    else
      this.perspective.setPath([ poiPosition, photographerPosition ])
  }
  getMarkerPosition = (key) => {
    if (this.state.points[key].marker)
      return this.state.points[key].marker.getPosition()
    
    else if (
      this.state.points[key].icon &&
      this.state.points[key].icon.dataset.pinX &&
      this.state.points[key].icon.dataset.pinY
    )
      return this.getMarkerPositionFromPixels(key)
  }
  getMarkerPositionFromPixels = (key) => {
    const canvasOffset = this.canvas.getBoundingClientRect()
    
    return this.markerOverlay
      .getProjection()
      .fromContainerPixelToLatLng(
        new google.maps.Point(
          this.state.points[key].icon.dataset.pinX - canvasOffset.left,
          this.state.points[key].icon.dataset.pinY - canvasOffset.top
        )
    )
  }
}