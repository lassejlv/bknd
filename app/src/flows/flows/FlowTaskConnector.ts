import type { Task, TaskResult } from "../tasks/Task";
import { type Condition, TaskConnection } from "../tasks/TaskConnection";
import type { Flow } from "./Flow";

// @todo: make singleton
export class FlowTaskConnector {
   flow: Flow;
   source: Task;

   constructor(flow: Flow, source: Task) {
      this.flow = flow;
      this.source = source;
   }

   // helper function to use itself
   private task(task: Task) {
      return new FlowTaskConnector(this.flow, task);
   }

   asInputFor(target: Task, condition?: Condition, max_retries?: number) {
      const ownDepth = this.getDepth();
      const outConnections = this.getOutConnections();
      const definedOutConditions = outConnections.map((c) => c.condition);
      const hasOutGoingBack = outConnections.some(
         (c) => this.task(c.target).getDepth() <= ownDepth
      );

      if (definedOutConditions.length > 0 && hasOutGoingBack) {
         if (this.getOutConnections().some((c) => c.condition.sameAs(condition))) {
            throw new Error("Task cannot be connected to a deeper task with the same condition");
         }
      }

      /*const targetDepth = this.task(target).getDepth();
      console.log("depth", ownDepth, targetDepth);

      // if target has a lower depth
      if (targetDepth > 0 && ownDepth >= targetDepth) {
         // check for unique out conditions
         console.log(
            "out conditions",
            this.source.name,
            this.getOutConnections().map((c) => [c.target.name, c.condition])
         );
         if (
            this.getOutConnections().some(
               (c) =>
                  c.condition[0] === condition[0] &&
                  c.condition[1] === condition[1]
            )
         ) {
            throw new Error(
               "Task cannot be connected to a deeper task with the same condition"
            );
         }
      }*/

      this.flow.addConnection(new TaskConnection(this.source, target, { condition, max_retries }));
   }

   asOutputFor(target: Task, condition?: Condition) {
      this.task(target).asInputFor(this.source, condition);
      //new FlowTaskConnector(this.flow, target).asInputFor(this.source);
      //this.flow.addConnection(new TaskConnection(target, this.source));
   }

   getNext() {
      return this.flow.connections.filter((c) => c.source === this.source).map((c) => c.target);
   }

   getDepth(): number {
      return this.flow.getSequence().findIndex((s) => s.includes(this.source));
   }

   getInConnections(lower_only: boolean = false): TaskConnection[] {
      if (lower_only) {
         const depth = this.getDepth();
         return this.getInConnections().filter(
            (c) => c.target === this.source && this.task(c.source).getDepth() < depth
         );
      }

      return this.flow.connections.filter((c) => c.target === this.source);
   }

   getInTasks(lower_only: boolean = false): Task[] {
      if (lower_only) {
         const depth = this.getDepth();
         return this.getInConnections()
            .map((c) => c.source)
            .filter((t) => this.task(t).getDepth() < depth);
      }

      return this.getInConnections().map((c) => c.source);
   }

   getOutConnections(result?: TaskResult): TaskConnection[] {
      if (result) {
         return this.flow.connections.filter(
            (c) => c.source === this.source && c.condition.isMet(result)
         );
      }

      return this.flow.connections.filter((c) => c.source === this.source);
   }

   getOutTasks(result?: TaskResult): Task[] {
      return this.getOutConnections(result).map((c) => c.target);
   }

   /*getNextRunnableConnections() {
      return this.getOutConnections().filter((c) => c.source.log.success);
   }

   getNextRunnableTasks() {
      return this.getNextRunnableConnections().map((c) => c.target);
   }*/
}