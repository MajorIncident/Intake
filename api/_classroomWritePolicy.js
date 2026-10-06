/**
 * @module api/classroomWritePolicy
 * @description
 * Resolves server-enforced Classroom Student snapshot-write policy without
 * making Standalone collaboration depend on Classroom authorization.
 */

import { getClassroomRepository } from './_classroom.js';

/**
 * Create a resolver for one active classroom-student capability hash.
 *
 * @param {object} [dependencies] Injectable dependencies.
 * @returns {(accessHash:string)=>Promise<object|null>} Write-policy resolver.
 */
export function createClassroomStudentWritePolicy({
  getRepository = getClassroomRepository
} = {}) {
  return async accessHash => {
    const repository = await getRepository();
    const context = await repository.getStudentContext(accessHash);
    if (!context) return null;

    const exercise = await repository.getCurrentExerciseByClassInternalId(
      context.internal.classId
    );

    if (!exercise) {
      return {
        allowed: true,
        classroom: context.classroom,
        workspace: context.workspace,
        exercise: null
      };
    }

    return {
      allowed: exercise.studentEditingEnabled !== false,
      classroom: context.classroom,
      workspace: context.workspace,
      exercise: {
        id: exercise.id,
        status: exercise.status,
        stagePhase: exercise.stagePhase,
        exerciseRevision: exercise.exerciseRevision,
        studentEditingEnabled: exercise.studentEditingEnabled
      }
    };
  };
}
