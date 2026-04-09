from flask import Flask, jsonify


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/api/health")
    def healthcheck():
        return jsonify(
            {
                "status": "ok",
                "service": "backend",
                "message": "Flask API is running.",
            }
        )

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
