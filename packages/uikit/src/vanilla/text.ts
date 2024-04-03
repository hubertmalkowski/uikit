import { Object3D } from 'three'
import { AllOptionalProperties, Properties } from '../properties/default.js'
import { Parent } from './index.js'
import { EventConfig, bindHandlers } from './utils.js'
import { Signal, batch, signal } from '@preact/signals-core'
import { TextProperties, createText } from '../components/text.js'
import { unsubscribeSubscriptions } from '../internals.js'

export class Text extends Object3D {
  private object: Object3D
  public readonly internals: ReturnType<typeof createText>
  public readonly eventConfig: EventConfig

  private readonly propertiesSignal: Signal<TextProperties>
  private readonly defaultPropertiesSignal: Signal<AllOptionalProperties | undefined>
  private readonly textSignal: Signal<string | Signal<string> | Array<string | Signal<string>>>

  constructor(
    parent: Parent,
    text: string | Signal<string> | Array<string | Signal<string>> = '',
    properties: TextProperties = {},
    defaultProperties?: AllOptionalProperties,
  ) {
    super()
    this.propertiesSignal = signal(properties)
    this.defaultPropertiesSignal = signal(defaultProperties)
    this.textSignal = signal(text)
    this.eventConfig = parent.eventConfig
    //setting up the threejs elements
    this.object = new Object3D()
    this.object.matrixAutoUpdate = false
    this.object.add(this)
    this.matrixAutoUpdate = false
    parent.add(this.object)

    //setting up the text
    this.internals = createText(
      parent.internals,
      this.textSignal,
      parent.fontFamiliesSignal,
      this.propertiesSignal,
      this.defaultPropertiesSignal,
      { current: this.object },
    )

    //setup events
    const { handlers, interactionPanel, subscriptions } = this.internals
    this.add(interactionPanel)
    bindHandlers(handlers, this, this.eventConfig, subscriptions)
  }

  setText(text: string | Signal<string> | Array<string | Signal<string>>) {
    this.textSignal.value = text
  }

  setProperties(properties: Properties, defaultProperties?: AllOptionalProperties) {
    batch(() => {
      this.propertiesSignal.value = properties
      this.defaultPropertiesSignal.value = defaultProperties
    })
  }

  destroy() {
    this.object.parent?.remove(this.object)
    unsubscribeSubscriptions(this.internals.subscriptions)
  }
}
