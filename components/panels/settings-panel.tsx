"use client"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function SettingsPanel() {
  // BACKEND HOOK: Load and persist user settings from database/storage

  return (
    <div className="space-y-6">
      {/* Display Settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Display</h3>

        <div className="flex items-center justify-between">
          <Label htmlFor="fullscreen" className="text-sm">
            Fullscreen Mode
          </Label>
          <Switch id="fullscreen" />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="crt-filter" className="text-sm">
            CRT Filter
          </Label>
          <Switch id="crt-filter" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="scale" className="text-sm">
            Screen Scale
          </Label>
          <Select defaultValue="auto">
            <SelectTrigger id="scale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (4:3)</SelectItem>
              <SelectItem value="1x">1x Native</SelectItem>
              <SelectItem value="2x">2x Scaled</SelectItem>
              <SelectItem value="3x">3x Scaled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Audio Settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Audio</h3>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="volume" className="text-sm">
              Master Volume
            </Label>
            <span className="text-sm text-muted-foreground">75%</span>
          </div>
          <Slider id="volume" defaultValue={[75]} max={100} step={1} className="w-full" />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="mute" className="text-sm">
            Mute
          </Label>
          <Switch id="mute" />
        </div>
      </div>

      {/* Game Settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Gameplay</h3>

        <div className="flex items-center justify-between">
          <Label htmlFor="auto-save" className="text-sm">
            Auto-save States
          </Label>
          <Switch id="auto-save" defaultChecked />
        </div>

        <div className="space-y-2">
          <Label htmlFor="save-slots" className="text-sm">
            Save Slots
          </Label>
          <Select defaultValue="3">
            <SelectTrigger id="save-slots">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Slot</SelectItem>
              <SelectItem value="3">3 Slots</SelectItem>
              <SelectItem value="5">5 Slots</SelectItem>
              <SelectItem value="10">10 Slots</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Controller Settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Controls</h3>

        <div className="flex items-center justify-between">
          <Label htmlFor="gamepad" className="text-sm">
            Enable Gamepad
          </Label>
          <Switch id="gamepad" defaultChecked />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="keyboard" className="text-sm">
            Keyboard Controls
          </Label>
          <Switch id="keyboard" defaultChecked />
        </div>
      </div>
    </div>
  )
}
