package center.kampus.app.functions

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.annotation.RequiresApi
import androidx.appfunctions.AppFunctionDeclaration
import androidx.appfunctions.AppFunctionSerializable
import androidx.appfunctions.AppFunctionService
import androidx.appfunctions.AppFunctionServiceEntryPoint
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import org.json.JSONException
import org.json.JSONObject

/*
 * What Gemini can ask Kampus for on an Android phone (A-274).
 *
 * This file is copied into the generated Android project by
 * `plugins/with-gemini-functions.js`; edit it here, never in `android/`.
 * Android's AppFunctions library reads the comments below as the description
 * an assistant sees, so they are written for the assistant: what the function
 * is for first, briefly, no instructions about other functions.
 *
 * The two that answer read the note the app keeps on the device (written by
 * `src/features/shortcuts`, stored by `modules/kampus-call`): names and hours
 * only, no sign-in. Nothing here uses the network.
 */

/** A lesson at the learning centre. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class Lesson(
  /** The name of the group or course, with the student's name first when a parent has several children. */
  val title: String,
  /** When the lesson starts, in the phone's own time zone. */
  val startsAt: LocalDateTime,
  /** When the lesson ends, in the phone's own time zone. */
  val endsAt: LocalDateTime,
  /** The room, when the centre named one. */
  val room: String?,
  /** True when the lesson is going on right now. */
  val onNow: Boolean,
)

/** The person's next lesson, or why none can be named. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class NextLessonAnswer(
  /**
   * "LESSON" when a lesson is given; "NO_LESSONS" when none is planned; "OUT_OF_DATE" when Kampus
   * has not been opened for a while and must be opened once to refresh; "SIGNED_OUT" when nobody
   * is signed in to Kampus on this phone.
   */
  val status: String,
  /** The lesson that is on now or comes next. Present only with the status "LESSON". */
  val lesson: Lesson?,
)

/** A homework task that waits for the student's answer. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class HomeworkTask(
  /** What the task is, with the student's name first when a parent has several children. */
  val title: String,
  /** The day the answer is due, as YYYY-MM-DD, when the teacher set one. */
  val dueDate: String?,
)

/** The homework that waits. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class HomeworkAnswer(
  /**
   * "STUDENT" when the person is a student or parent and [tasks] lists what waits for an answer;
   * "TEACHER" when the person teaches and [answersToCheck] counts what waits to be checked;
   * "SIGNED_OUT" when nobody is signed in to Kampus on this phone.
   */
  val status: String,
  /** A student's tasks that wait for an answer, soonest first, at most ten. Empty for a teacher. */
  val tasks: List<HomeworkTask>,
  /** A teacher's number of student answers that wait to be checked. Absent for a student. */
  val answersToCheck: Int?,
)

@RequiresApi(36)
@AppFunctionServiceEntryPoint(
  serviceName = "KampusAppFunctionService",
  appFunctionXmlFileName = "kampus_app_function_service",
)
abstract class BaseKampusAppFunctionService : AppFunctionService() {
  /**
   * Gets the person's next lesson at their learning centre: its name, start and end time and room.
   * For a teacher it is the next lesson they teach, for a student or parent the next one they attend.
   *
   * @return The lesson that is on now or comes next, or the reason none can be named.
   */
  @AppFunctionDeclaration(isDescribedByKDoc = true)
  suspend fun getNextLesson(): NextLessonAnswer {
    val note = KampusNote.read(this) ?: return NextLessonAnswer("SIGNED_OUT", null)
    val now = System.currentTimeMillis()
    val next = note.lessons.firstOrNull { it.endsAt > now }
    if (next == null) {
      val old = now - note.savedAt > NOTE_LIFETIME
      return NextLessonAnswer(if (old) "OUT_OF_DATE" else "NO_LESSONS", null)
    }
    val zone = ZoneId.systemDefault()
    return NextLessonAnswer(
      "LESSON",
      Lesson(
        title = next.title,
        startsAt = LocalDateTime.ofInstant(Instant.ofEpochMilli(next.startsAt), zone),
        endsAt = LocalDateTime.ofInstant(Instant.ofEpochMilli(next.endsAt), zone),
        room = next.place,
        onNow = next.live || next.startsAt <= now,
      ),
    )
  }

  /**
   * Gets the homework that waits at the person's learning centre. A student or parent gets the
   * tasks that still need an answer; a teacher gets how many student answers wait to be checked.
   *
   * @return The waiting tasks, or the number of answers to check.
   */
  @AppFunctionDeclaration(isDescribedByKDoc = true)
  suspend fun getHomework(): HomeworkAnswer {
    val note = KampusNote.read(this) ?: return HomeworkAnswer("SIGNED_OUT", emptyList(), null)
    if (note.kind == "staff") return HomeworkAnswer("TEACHER", emptyList(), note.toCheck ?: 0)
    return HomeworkAnswer("STUDENT", note.homework.map { HomeworkTask(it.title, it.due) }, null)
  }

  /**
   * Opens the person's lesson in Kampus: the lesson that is on now, or the next one. A teacher
   * lands on the lesson's page with attendance and the video lesson button, a student in the
   * lesson room when the lesson is on.
   *
   * @return The screen to open.
   */
  @AppFunctionDeclaration(isDescribedByKDoc = true)
  suspend fun openLesson(): PendingIntent {
    // The same link Android's home screen shortcut opens; the app finds the lesson itself.
    val intent =
      Intent(Intent.ACTION_VIEW, Uri.parse("kampus://shortcut/start-lesson"))
        .setClassName(packageName, "$packageName.MainActivity")
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(
      this,
      0,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private companion object {
    /** After this long without the app being opened, "no lessons" may only mean the note is old. */
    const val NOTE_LIFETIME = 12 * 60 * 60 * 1000L
  }
}

/** The note as JavaScript wrote it (`ShortcutSnapshot` in `src/features/shortcuts/snapshot.ts`). */
internal class KampusNote(
  val kind: String,
  val savedAt: Long,
  val lessons: List<NotedLesson>,
  val homework: List<NotedTask>,
  val toCheck: Int?,
) {
  class NotedLesson(
    val title: String,
    val place: String?,
    val startsAt: Long,
    val endsAt: Long,
    val live: Boolean,
  )

  class NotedTask(val title: String, val due: String?)

  companion object {
    // The same file and key as `ShortcutNote` in modules/kampus-call, which writes it.
    private const val FILE = "kampus.shortcuts"
    private const val KEY = "note"

    /** The note, or null when nobody is signed in or the text cannot be read. */
    fun read(context: Context): KampusNote? {
      val text =
        context.applicationContext
          .getSharedPreferences(FILE, Context.MODE_PRIVATE)
          .getString(KEY, null) ?: return null
      return try {
        parse(JSONObject(text))
      } catch (e: JSONException) {
        null
      }
    }

    private fun parse(json: JSONObject): KampusNote {
      val lessons = json.getJSONArray("lessons")
      val homework = json.getJSONArray("homework")
      return KampusNote(
        kind = json.getString("kind"),
        savedAt = json.getLong("savedAt"),
        lessons =
          (0 until lessons.length())
            .map { lessons.getJSONObject(it) }
            .map {
              NotedLesson(
                title = it.getString("title"),
                place = if (it.isNull("place")) null else it.getString("place"),
                startsAt = it.getLong("startsAt"),
                endsAt = it.getLong("endsAt"),
                live = it.optBoolean("live", false),
              )
            }
            .sortedBy { it.startsAt },
        homework =
          (0 until homework.length())
            .map { homework.getJSONObject(it) }
            .map { NotedTask(it.getString("title"), if (it.isNull("due")) null else it.getString("due")) },
        toCheck = if (json.isNull("toCheck")) null else json.getInt("toCheck"),
      )
    }
  }
}
