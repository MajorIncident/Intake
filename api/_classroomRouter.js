/**
 * @module api/classroomRouter
 * @description
 * Server-only dispatcher that lets Vercel expose the complete Classroom API
 * through one Serverless Function while preserving the existing public URLs
 * via vercel.json rewrites. Routing is not authorization: every delegated
 * handler retains its existing capability, method, and payload checks.
 */

import {
  classAdmitHandler,
  classCoachingHandler,
  classDebriefHandler,
  classHandler,
  classJoinHandler,
  classObserveHandler,
  classParticipantsHandler,
  classStudentAccessHandler,
  classStudentCoachingHandler,
  classStudentHandler,
  classWorkspacesHandler
} from './_classroom.js';
import {
  instructorCaseStudiesHandler,
  studentCaseStudiesHandler
} from './_protectedCaseStudies.js';
import {
  classExerciseCheckpointHandler,
  classExerciseHandler,
  classStudentExerciseHandler,
  classStudentExerciseReadyHandler
} from './_classroomExercise.js';

export const CLASSROOM_ROUTE_PARAM = '__classroomRoute';

export const CLASSROOM_ROUTE_IDS = Object.freeze([
  'root',
  'admit',
  'join',
  'participants',
  'student',
  'student-access',
  'workspaces',
  'observe',
  'coaching',
  'coaching-student',
  'debrief',
  'case-studies',
  'case-studies-student',
  'exercise',
  'exercise-checkpoint',
  'exercise-student',
  'exercise-student-ready'
]);

function defaultHandlers() {
  return {
    root: classHandler(),
    admit: classAdmitHandler(),
    join: classJoinHandler(),
    participants: classParticipantsHandler(),
    student: classStudentHandler(),
    'student-access': classStudentAccessHandler(),
    workspaces: classWorkspacesHandler(),
    observe: classObserveHandler(),
    coaching: classCoachingHandler(),
    'coaching-student': classStudentCoachingHandler(),
    debrief: classDebriefHandler(),
    'case-studies': instructorCaseStudiesHandler(),
    'case-studies-student': studentCaseStudiesHandler(),
    exercise: classExerciseHandler(),
    'exercise-checkpoint': classExerciseCheckpointHandler(),
    'exercise-student': classStudentExerciseHandler(),
    'exercise-student-ready': classStudentExerciseReadyHandler()
  };
}

function requestedRoute(req) {
  const value = req?.query?.[CLASSROOM_ROUTE_PARAM];
  return typeof value === 'string' ? value.trim() : '';
}

function notFound(res) {
  res.setHeader?.('Cache-Control', 'no-store');
  res.setHeader?.('Referrer-Policy', 'no-referrer');
  return res.status(404).json({ error: 'Classroom route not found.' });
}

/**
 * Create the single-function Classroom route dispatcher.
 *
 * @param {object} [options] Dependency overrides.
 * @param {Record<string, Function>} [options.handlers] Route handler map for deterministic tests.
 * @returns {Function} Vercel request handler.
 */
export function createClassroomRouteDispatcher({ handlers = defaultHandlers() } = {}) {
  return async (req, res) => {
    const route = requestedRoute(req);
    const handler = Object.hasOwn(handlers, route) ? handlers[route] : null;
    if (typeof handler !== 'function') return notFound(res);
    return handler(req, res);
  };
}
