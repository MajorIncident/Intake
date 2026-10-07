/**
 * @module api/classroom
 * @description Single Vercel Serverless Function entrypoint for all Classroom routes.
 */
import { createClassroomRouteDispatcher } from './_classroomRouter.js';

export default createClassroomRouteDispatcher();
