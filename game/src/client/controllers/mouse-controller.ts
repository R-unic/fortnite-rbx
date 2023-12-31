import { Controller, OnInit, OnRender } from "@flamework/core";
import { HttpService as HTTP, UserInputService as UIS, Workspace as World } from "@rbxts/services";
import { RaycastParamsBuilder } from "@rbxts/builders";
import { Context as InputContext } from "@rbxts/gamejoy";
import { Axis, Union } from "@rbxts/gamejoy/out/Actions";
import { StrictMap } from "@rbxts/strict-map";
import { Events } from "client/network";

import { Player } from "common/utilities/client";

const { setMouseBehavior } = Events;
const { abs } = math;

export const enum MouseIcon {
  Default,
  Drag
}

@Controller()
export class MouseController implements OnInit, OnRender {
  public down = false;

  private behavior: Enum.MouseBehavior = Enum.MouseBehavior.Default;
  private readonly mouseRayDistance = 1000;
  private readonly playerMouse = Player.GetMouse();
  private readonly clickAction = new Union(["MouseButton1", "Touch"]);
  private readonly scrollAction = new Axis("MouseWheel");
  private readonly clickCallbacks = new StrictMap<string, Callback>;
  private readonly input = new InputContext({
    ActionGhosting: 0,
    Process: false,
    RunSynchronously: true
  });

  public onInit(): void {
    setMouseBehavior.connect(behavior => this.setBehavior(behavior));

    this.input
      .Bind(this.clickAction, () => {
        this.down = true;
        this.clickCallbacks.forEach(callback => task.spawn(callback));
      })
      .BindEvent("onRelease", this.clickAction.Released, () => {
        this.down = false
      });

    UIS.TouchStarted.Connect(() => this.down = true);
    UIS.TouchEnded.Connect(() => this.down = false);
  }

  public onRender(): void {
    UIS.MouseBehavior = this.behavior;
  }

  // returns a function that removes the listener
  public onClick(callback: Callback, predicate?: () => boolean): Callback {
    const id = HTTP.GenerateGUID();
    const disconnect = () => this.clickCallbacks.delete(id);
    this.clickCallbacks.set(id, () => {
      if (predicate && !predicate()) return;
      callback()
    });

    return disconnect;
  }

  public onScroll(callback: (direction: number) => void): Callback {
    this.input.Bind(this.scrollAction, () => callback(-this.scrollAction.Position.Z));
    const pinchConn = UIS.TouchPinch.Connect((_, scale) => callback((scale < 1 ? 1 : -1) * abs(scale - 2)));

    return () => {
      this.input.Unbind(this.scrollAction);
      pinchConn.Disconnect();
    };
  }

  public toggleIcon(on: boolean): void {
    UIS.MouseIconEnabled = on
  }

  public getWorldPosition(distance = this.mouseRayDistance): Vector3 {
    const { X, Y } = UIS.GetMouseLocation();
    const { Origin, Direction } = World.CurrentCamera!.ViewportPointToRay(X, Y);
    const raycastResult = this.createRay(distance);
    if (raycastResult)
      return raycastResult.Position;
    else
      return Origin.add(Direction.mul(distance));
  }

  public target(distance = this.mouseRayDistance): Maybe<BasePart> {
    return this.createRay(distance)?.Instance;
  }

  public delta(): Vector2 {
    return UIS.GetMouseDelta();
  }

  public setTargetFilter(filterInstance: Instance) {
    this.playerMouse.TargetFilter = filterInstance;
  }

  public setBehavior(behavior: Enum.MouseBehavior) {
    this.behavior = behavior;
  }

  public setIcon(icon: MouseIcon): void {
    const assetID = this.getIconAsset(icon);
    this.playerMouse.Icon = assetID;
  }

  private createRay(distance: number, filter: Instance[] = []): Maybe<RaycastResult> {
    const { X, Y } = UIS.GetMouseLocation();
    const { Origin, Direction } = World.CurrentCamera!.ViewportPointToRay(X, Y);

    const raycastParams = new RaycastParamsBuilder()
      .SetIgnoreWater(true)
      .AddToFilter(...filter)
      .Build();

    return World.Raycast(Origin, Direction.mul(distance), raycastParams);
  }

  private getIconAsset(icon: MouseIcon): string {
    switch (icon) {
      case MouseIcon.Default:
        return "rbxasset://SystemCursors/Arrow";
      case MouseIcon.Drag:
        return "rbxasset://SystemCursors/PointingHand";
    }
  }
}